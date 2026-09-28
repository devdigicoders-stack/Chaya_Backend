const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String, required: true },
  password: { type: String, required: true },
  role: {
    type: String,
    enum: [
      'ADMIN',
      'DATA_CONTROLLER',
      'STAFF_HEAD',
      'CALLING_STAFF',
      'INTERVIEW_PANEL',
      'MEDICAL_DEPT',
      'ACCOUNTS',
      'PRE_VISA_MANAGER',
      'VISA_MANAGER',
      'VIVA_MANAGER'
    ],
    required: true
  },
  avatar: { type: String, default: '' },
  department: { type: String, default: 'System Administration' },
  teamHeadId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

// Password is kept readable as requested by Admin
UserSchema.methods.matchPassword = async function (enteredPassword) {
  if (this.password === enteredPassword) return true;
  try {
    const bcrypt = require('bcryptjs');
    return await bcrypt.compare(enteredPassword, this.password);
  } catch (_) {
    return false;
  }
};

module.exports = mongoose.model('User', UserSchema);
