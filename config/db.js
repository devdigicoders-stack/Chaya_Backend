const mongoose = require('mongoose');
const dns = require('dns');

// Prioritize IPv4 to avoid IPv6 ETIMEDOUT issues on Indian ISPs
try {
  dns.setDefaultResultOrder('ipv4first');
} catch (e) {
  // Ignored if older node version
}

let isConnecting = false;

const connectDB = async () => {
  if (isConnecting) return;
  isConnecting = true;

  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 7000,
      connectTimeoutMS: 10000,
      family: 4
    });
    console.log(`✅ MongoDB Connected Successfully: ${conn.connection.host}`);
    isConnecting = false;
  } catch (error) {
    console.error(`⚠️  MongoDB Connection Error: ${error.message}`);
    console.log(`
👉 TROUBLESHOOTING TIP:
   1. MongoDB Atlas Network Access:
      - Go to https://cloud.mongodb.com
      - Click "Network Access" -> "Add IP Address"
      - Add "0.0.0.0/0" (Allow from Anywhere) or add your current IP.
   2. Retrying connection in 5 seconds...
`);
    isConnecting = false;
    // Auto-retry in 5 seconds without crashing the server
    setTimeout(connectDB, 5000);
  }
};

// Handle connection events
mongoose.connection.on('disconnected', () => {
  console.log('⚠️ MongoDB disconnected! Attempting to reconnect...');
  setTimeout(connectDB, 5000);
});

module.exports = connectDB;
