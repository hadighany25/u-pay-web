const express = require("express");
const fs = require("fs");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = 3000;

// កំណត់ទំហំធំដើម្បីទទួលរូបភាព Profile
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(express.static("public"));
app.use(cors());

const DATA_FILE = path.join(__dirname, "data", "users.json");

// --- HELPER FUNCTIONS ---

const readData = () => {
  if (!fs.existsSync(DATA_FILE)) {
    if (!fs.existsSync(path.join(__dirname, "data")))
      fs.mkdirSync(path.join(__dirname, "data"));
    fs.writeFileSync(DATA_FILE, "[]");
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE));
  } catch (e) {
    return [];
  }
};

const writeData = (data) => {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
};

const getFormattedDate = () => {
  return new Date().toLocaleString("en-US", {
    timeZone: "Asia/Phnom_Penh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
};

const getDevice = (ua) => {
  if (!ua) return "Unknown";
  if (ua.includes("iPhone")) return "iPhone";
  if (ua.includes("Android")) return "Android";
  if (ua.includes("Windows")) return "PC (Windows)";
  if (ua.includes("Mac")) return "Mac";
  return "Web Browser";
};

// 🔥 1. បង្កើត Transaction ID (លេខសុទ្ធ ១០ ខ្ទង់)
const generateRefId = () => {
  return Math.floor(1000000000 + Math.random() * 9000000000).toString();
};

// 🔥 2. បង្កើត Hash (អក្សរ + លេខ ៨ ខ្ទង់)
const generateHash = () => {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// --- AUTO INIT BILLERS (បង្កើតគណនីក្រុមហ៊ុនទឹកភ្លើងស្វ័យប្រវត្តិ) ---
const initBillers = () => {
  let users = readData();
  const billers = [
    { username: "EDC", accountNumber: "100000001" },
    { username: "PPWSA", accountNumber: "100000002" },
    { username: "Internet", accountNumber: "100000003" },
  ];

  let updated = false;
  billers.forEach((b) => {
    if (!users.find((u) => u.username === b.username)) {
      users.push({
        id: "BILLER-" + b.username,
        username: b.username,
        password: "123",
        accountNumber: b.accountNumber,
        balance: 0.0,
        role: "biller",
        pin: "0000",
        profileImage: "",
        isFrozen: false,
        transactions: [],
        lastActive: new Date().toISOString(),
      });
      updated = true;
      console.log(`✅ Created Biller: ${b.username}`);
    }
  });

  if (updated) writeData(users);
};
initBillers(); // Run on startup

// --- AUTH ROUTES ---

// 1. REGISTER
// 🔥 REGISTER (UPDATED PROFESSIONAL)
app.post("/api/register", (req, res) => {
  // ទទួលទិន្នន័យច្រើនជាងមុន
  const { username, password, fullName, phone, pin } = req.body;
  let users = readData();

  // 1. ឆែកមើលថា Username មានគេប្រើនៅ?
  if (users.find((u) => u.username === username)) {
    return res.json({ success: false, message: "Username already taken!" });
  }

  // 2. ឆែកមើលថា Phone មានគេប្រើនៅ?
  if (users.find((u) => u.phone === phone)) {
    return res.json({
      success: false,
      message: "Phone number already registered!",
    });
  }

  // 3. បង្កើត User ថ្មី
  const newUser = {
    id: Date.now().toString(),
    username: username,
    password: password,
    fullName: fullName || username, // ប្រើឈ្មោះពេញ បើអត់មានយក username
    phone: phone,
    pin: pin, // 🔥 ប្រើ PIN ដែលគេបង្កើត (លែងប្រើ 1234)
    accountNumber: Math.floor(100000000 + Math.random() * 900000000).toString(), //បង្កើតលេខគណនី 9 ខ្ទង់
    balance: 0.0,
    role: "user",
    trxLimit: 1000.0,
    profileImage: "",
    isFrozen: false,
    pinAttempts: 0,
    transactions: [],
    lastActive: new Date().toISOString(),
  };

  users.push(newUser);
  writeData(users);
  res.json({ success: true, user: newUser });
});

// 2. LOGIN
// 🔥 LOGIN (Updated: Support Username, Phone, or Full Name)
app.post("/api/login", (req, res) => {
  // identifier អាចជា username, phone, ឬ fullName
  const { identifier, password } = req.body;

  // Admin Check (Hardcoded)
  if (identifier === "admin" && password === "123") {
    return res.json({
      success: true,
      user: {
        username: "Admin",
        role: "admin",
        balance: 999999,
        accountNumber: "HQ-001",
      },
    });
  }

  let users = readData();

  // ស្វែងរក User ដែលត្រូវនឹងលក្ខខណ្ឌណាមួយ
  const user = users.find(
    (u) =>
      (u.username === identifier ||
        u.phone === identifier ||
        u.fullName === identifier) &&
      u.password === password,
  );

  if (user) {
    if (user.isFrozen)
      return res.json({ success: false, message: "Account Frozen!" });
    user.lastActive = new Date().toISOString();
    writeData(users);
    res.json({ success: true, user });
  } else {
    res.json({ success: false, message: "Invalid Credentials" });
  }
});

// --- TRANSACTION ROUTES ---

// 3. TRANSFER
app.post("/api/transfer", (req, res) => {
  const { senderUsername, receiverAccount, amount, remark, pin, trxMethod } =
    req.body; // 🔥 ថែម trxMethod
  let users = readData();
  const sender = users.find((u) => u.username === senderUsername);
  const receiver = users.find((u) => u.accountNumber === receiverAccount);

  if (!sender) return res.json({ success: false, message: "Account Error" });
  if (sender.isFrozen)
    return res.json({ success: false, message: "Account Frozen" });

  // 🔥 PIN Check (3 Strikes)
  if (sender.pin !== pin) {
    sender.pinAttempts = (sender.pinAttempts || 0) + 1;
    if (sender.pinAttempts >= 3) {
      sender.isFrozen = true;
      sender.pinAttempts = 0;
      writeData(users);
      return res.json({
        success: false,
        message: "Wrong PIN 3 times! Account Frozen.",
      });
    }
    writeData(users);
    return res.json({
      success: false,
      message: `Wrong PIN! Attempts left: ${3 - sender.pinAttempts}`,
    });
  }
  sender.pinAttempts = 0; // Reset if correct

  // 🔥 Check Limit
  if (parseFloat(amount) > sender.trxLimit) {
    return res.json({
      success: false,
      message: `Over Limit! Your limit is $${sender.trxLimit}`,
    });
  }

  if (!receiver)
    return res.json({ success: false, message: "Receiver not found" });
  if (sender.balance < parseFloat(amount))
    return res.json({ success: false, message: "Insufficient Balance" });
  if (sender.accountNumber === receiverAccount)
    return res.json({ success: false, message: "Cannot transfer to self" });

  const transferAmount = parseFloat(amount);
  sender.balance -= transferAmount;
  receiver.balance += transferAmount;

  // 🔥 Generate Professional Data
  const date = getFormattedDate();
  const refId = generateRefId(); // លេខ 10 ខ្ទង់
  const trxHash = generateHash(); // Hash 8 ខ្ទង់
  const deviceName = getDevice(req.headers["user-agent"]);
  const ipAddress = req.ip || req.connection.remoteAddress;

  const senderTrx = {
    refId,
    hash: trxHash, // Save Hash
    date,
    type: "Transfer",
    amount: -transferAmount,
    fee: 0.0,
    senderName: sender.username,
    senderAcc: sender.accountNumber,
    receiverName: receiver.username,
    receiverAcc: receiver.accountNumber,
    remark: remark || "General",
    status: "Success",
    device: deviceName,
    ip: ipAddress,
    trxMethod: trxMethod || "Account Input", // 🔥 រក្សាទុក (Default: Account Input)
    // ...
  };

  const receiverTrx = {
    ...senderTrx,
    amount: transferAmount,
    type: "Received",
  };

  sender.transactions.unshift(senderTrx);
  receiver.transactions.unshift(receiverTrx);

  writeData(users);
  res.json({ success: true, newBalance: sender.balance, slipData: senderTrx });
});

// 4. BILL PAYMENT
app.post("/api/payment", (req, res) => {
  const { username, billerName, billId, amount, pin } = req.body;
  let users = readData();
  const user = users.find((u) => u.username === username);
  const biller = users.find((u) => u.username === billerName);

  if (!user) return res.json({ success: false, message: "User Error" });
  if (!biller) return res.json({ success: false, message: "Biller Not Found" });
  if (user.isFrozen)
    return res.json({ success: false, message: "Account Frozen" });

  if (user.pin !== pin) {
    user.pinAttempts = (user.pinAttempts || 0) + 1;
    if (user.pinAttempts >= 3) {
      user.isFrozen = true;
      user.pinAttempts = 0;
      writeData(users);
      return res.json({
        success: false,
        message: "Wrong PIN 3 times! Account Frozen.",
      });
    }
    writeData(users);
    return res.json({ success: false, message: "Wrong PIN" });
  }
  user.pinAttempts = 0;

  if (parseFloat(amount) > user.trxLimit)
    return res.json({
      success: false,
      message: `Over Limit! Your limit is $${user.trxLimit}`,
    });
  if (user.balance < parseFloat(amount))
    return res.json({ success: false, message: "Insufficient Balance" });

  const payAmount = parseFloat(amount);
  user.balance -= payAmount;
  biller.balance += payAmount;

  // 🔥 Generate Professional Data
  const refId = generateRefId();
  const trxHash = generateHash();
  const date = getFormattedDate();
  const deviceName = getDevice(req.headers["user-agent"]);

  const trx = {
    refId,
    hash: trxHash,
    date,
    type: "Bill Payment",
    amount: -payAmount,
    fee: 0.0,
    senderName: user.username,
    senderAcc: user.accountNumber,
    receiverName: billerName,
    receiverAcc: biller.accountNumber,
    remark: `Bill ID: ${billId}`,
    status: "Success",
    billId: billId, // For Pay Again button
    device: deviceName,
    ip: req.ip,
  };

  user.transactions.unshift(trx);
  biller.transactions.unshift({
    ...trx,
    amount: payAmount,
    type: "Income (Bill)",
  });

  writeData(users);
  res.json({ success: true, newBalance: user.balance, slipData: trx });
});

// --- SETTINGS ROUTES ---

app.post("/api/change-password", (req, res) => {
  const { username, oldPassword, newPassword } = req.body;
  let users = readData();
  const user = users.find((u) => u.username === username);
  if (user && user.password === oldPassword) {
    user.password = newPassword;
    writeData(users);
    res.json({ success: true });
  } else res.json({ success: false, message: "Old password incorrect" });
});

app.post("/api/change-pin", (req, res) => {
  const { username, password, newPin } = req.body;
  let users = readData();
  const user = users.find((u) => u.username === username);
  if (user && user.password === password) {
    user.pin = newPin;
    user.pinAttempts = 0;
    writeData(users);
    res.json({ success: true });
  } else res.json({ success: false, message: "Password incorrect" });
});

app.post("/api/change-limit", (req, res) => {
  const { username, password, newLimit } = req.body;
  let users = readData();
  const user = users.find((u) => u.username === username);
  if (user && user.password === password) {
    user.trxLimit = parseFloat(newLimit);
    writeData(users);
    res.json({ success: true });
  } else res.json({ success: false, message: "Password incorrect" });
});

app.post("/api/update-profile-pic", (req, res) => {
  const { username, image } = req.body;
  let users = readData();
  const user = users.find((u) => u.username === username);
  if (user) {
    user.profileImage = image;
    writeData(users);
    res.json({ success: true });
  } else res.json({ success: false });
});

// --- ADMIN ROUTES ---

app.get("/api/admin/stats", (req, res) => {
  const users = readData();
  const labels = [];
  const data = Array(7).fill(0);
  const today = new Date();

  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    labels.push(d.toLocaleDateString("en-US", { weekday: "short" }));
  }

  users.forEach((u) => {
    if (u.transactions) {
      u.transactions.forEach((t) => {
        if (t.amount < 0) {
          const tDate = new Date(t.date.split(",")[0]);
          const diffDays = Math.ceil(
            Math.abs(today - tDate) / (1000 * 60 * 60 * 24),
          );
          const index = 7 - diffDays;
          if (index >= 0 && index < 7) data[index] += Math.abs(t.amount);
        }
      });
    }
  });

  res.json({ labels, data });
});

app.post("/api/admin/toggle-freeze", (req, res) => {
  const { id, isFrozen } = req.body;
  let users = readData();
  const u = users.find((user) => user.id === id);
  if (u) {
    u.isFrozen = isFrozen;
    if (!isFrozen) u.pinAttempts = 0;
    writeData(users);
    res.json({ success: true });
  } else res.json({ success: false });
});

// 🔥 ស្វែងរកប្រតិបត្តិការតាម Ref ID ឬ Hash
app.get("/api/admin/transaction/:id", (req, res) => {
  const searchTerm = req.params.id.trim(); // អាចជា Ref ID ឬ Hash
  const users = readData();
  let foundTrx = null,
    owner = null;

  for (const u of users) {
    if (u.transactions) {
      // 🔥 កែត្រង់នេះ៖ ឱ្យស្វែងរកតាម refId ក៏បាន ឬ hash ក៏បាន
      const trx = u.transactions.find(
        (t) => t.refId === searchTerm || t.hash === searchTerm,
      );
      if (trx) {
        foundTrx = trx;
        owner = u;
        break;
      }
    }
  }
  if (foundTrx)
    res.json({
      success: true,
      transaction: foundTrx,
      user: { username: owner.username, accountNumber: owner.accountNumber },
    });
  else res.json({ success: false });
});

// 🔥 API: EDIT USER (Updated with Password)
app.post("/api/admin/edit-user", (req, res) => {
  // ថែម password មកទទួល
  const { id, username, balance, pin, profileImage, accountNumber, password } =
    req.body;
  let users = readData();
  const u = users.find((user) => user.id === id);
  if (u) {
    u.username = username;
    u.accountNumber = accountNumber;
    u.balance = parseFloat(balance);
    u.pin = pin;
    u.profileImage = profileImage;

    // 🔥 ឆែកមើល៖ បើ Admin វាយ Password ថ្មីមក ចាំដូរ។ បើទទេ កុំដូរ។
    if (password && password.trim() !== "") {
      u.password = password;
    }

    writeData(users);
    res.json({ success: true });
  } else res.json({ success: false });
});

// 🔥 API: DELETE USER (New)
app.post("/api/admin/delete-user", (req, res) => {
  const { id } = req.body;
  let users = readData();
  const initialLength = users.length;
  // Filter out the user to delete
  const newUsers = users.filter((u) => u.id !== id);

  if (newUsers.length < initialLength) {
    writeData(newUsers);
    res.json({ success: true });
  } else {
    res.json({ success: false, message: "User not found" });
  }
});

// Common
app.get("/api/users", (req, res) => res.json(readData()));
app.post("/api/check-account", (req, res) => {
  const { accountNumber } = req.body;
  const u = readData().find((user) => user.accountNumber === accountNumber);
  res.json(u ? { success: true, username: u.username } : { success: false });
});
app.post("/api/heartbeat", (req, res) => {
  const { username } = req.body;
  let users = readData();
  const idx = users.findIndex((u) => u.username === username);
  if (idx !== -1) {
    users[idx].lastActive = new Date().toISOString();
    writeData(users);
    res.json({ success: true });
  } else res.json({ success: false });
});

// 🔥 API: CHANGE PASSWORD (USER)
app.post("/api/user/change-password", (req, res) => {
  const { id, oldPassword, newPassword } = req.body;
  let users = readData();
  const u = users.find((user) => user.id === id);

  if (u && u.password === oldPassword) {
    u.password = newPassword;
    writeData(users);
    res.json({ success: true });
  } else {
    res.json({ success: false, message: "Incorrect old password!" });
  }
});

// 🔥 API: CHANGE PIN (USER)
app.post("/api/user/change-pin", (req, res) => {
  const { id, oldPin, newPin } = req.body;
  let users = readData();
  const u = users.find((user) => user.id === id);

  if (u && u.pin === oldPin) {
    if (newPin.length !== 4)
      return res.json({ success: false, message: "PIN must be 4 digits" });
    u.pin = newPin;
    writeData(users);
    res.json({ success: true });
  } else {
    res.json({ success: false, message: "Incorrect old PIN!" });
  }
});

// 🔥 API: UPDATE PROFILE IMAGE
app.post("/api/user/update-image", (req, res) => {
  const { id, imageUrl } = req.body;
  let users = readData();
  const u = users.find((user) => user.id === id);
  if (u) {
    u.profileImage = imageUrl;
    writeData(users);
    res.json({ success: true });
  } else res.json({ success: false });
});

app.listen(PORT, "0.0.0.0", () =>
  console.log(`✅ U-PAY SERVER RUNNING on Port ${PORT}`),
);
