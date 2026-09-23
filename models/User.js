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
      'DATA_CONTROLLER',   // Added Data Controller Role
      'STAFF_HEAD',
      'CALLING_STAFF',
      'INTERVIEW_PANEL',
      'MEDICAL_DEPT',
      'ACCOUNTS',
      'PRE_VISA_MANAGER',
      'VISA_MANAGER'
    ],
    required: true
  },
  teamHeadId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

UserSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  const bcrypt = require('bcryptjs');
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

UserSchema.methods.matchPassword = async function (enteredPassword) {
  const bcrypt = require('bcryptjs');
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);
