const mongoose = require('mongoose');

const ChecklistConfigSchema = new mongoose.Schema({
  fromStage: { 
    type: String, 
    required: true,
    enum: [
      'UNASSIGNED',
      'CALLING_SCREENING',
      'INITIAL_INTERVIEW',
      'MEDICAL_PROCESS',
      'FINAL_INTERVIEW',
      'ACCOUNTS_COLLECTION',
      'STAFF_HEAD_HANDLING',
      'VACANCY_MATCHING',
      'PRE_VISA',
      'VISA_PROCESSING',
      'COMPLETED'
    ]
  },
  toStage: { 
    type: String, 
    required: true,
    enum: [
      'CALLING_SCREENING',
      'INITIAL_INTERVIEW',
      'MEDICAL_PROCESS',
      'FINAL_INTERVIEW',
      'ACCOUNTS_COLLECTION',
      'STAFF_HEAD_HANDLING',
      'VACANCY_MATCHING',
      'PRE_VISA',
      'VISA_PROCESSING',
      'CANCELLED',
      'REJECTED',
      'COMPLETED'
    ]
  },
  checklistItems: [{
    itemKey: { type: String, required: true }, // Unique code identifier e.g., 'PASSPORT_DOC_VERIFIED'
    label: { type: String, required: true },   // User friendly Hindi/English description
    isMandatory: { type: Boolean, default: true }
  }],
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

// Ensure unique fromStage to toStage transition rules
ChecklistConfigSchema.index({ fromStage: 1, toStage: 1 }, { unique: true });

module.exports = mongoose.model('ChecklistConfig', ChecklistConfigSchema);
