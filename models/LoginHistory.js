const mongoose = require('mongoose');

const LoginHistorySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userName: { type: String, required: true },
  email: { type: String, required: true },
  role: { type: String, required: true },
  department: { type: String, default: 'General Operations' },
  ip: { type: String, default: '103.21.58.12' },
  location: { type: String, default: 'Delhi HQ - Central Wing' },
  device: { type: String, default: 'Chrome 128 on Windows 11 Enterprise' },
  deviceType: { type: String, enum: ['desktop', 'mobile', 'tablet'], default: 'desktop' },
  userAgent: { type: String, default: '' },
  status: { type: String, enum: ['Active Session', 'Terminated', 'Logged Out'], default: 'Active Session' },
  durationText: { type: String, default: 'Active' },
  loginTime: { type: Date, default: Date.now },
  lastActiveTime: { type: Date, default: Date.now },
  terminatedAt: { type: Date, default: null },
  terminatedBy: { type: String, default: null },
  tlsCipher: { type: String, default: 'TLS_AES_256_GCM_SHA384 (ECDHE-P256)' }
}, { timestamps: true });

module.exports = mongoose.model('LoginHistory', LoginHistorySchema);
