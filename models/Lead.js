const mongoose = require('mongoose');

const LeadSchema = new mongoose.Schema({
  leadId: { type: String, required: true, unique: true }, // e.g., LEAD-1001
  source: { 
    type: String, 
    enum: ['WHATSAPP', 'FACEBOOK', 'EXCEL', 'MANUAL'], 
    default: 'MANUAL' 
  },
  candidateName: { type: String, required: true },
  phone: { type: String, required: true },
  passportNumber: { type: String, default: null },
  isPassportHolder: { 
    type: String, 
    enum: ['YES', 'NO', 'NOT_CONFIRMED'], 
    default: 'NOT_CONFIRMED' 
  },
  
  // Current Workflow Stage
  currentStage: {
    type: String,
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
      'CANCELLED',
      'REJECTED',
      'COMPLETED'
    ],
    default: 'UNASSIGNED'
  },

  // Assignees
  assignedStaffHead: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  assignedCallingStaff: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  assignedInterviewPanel: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  assignedPreVisaManager: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  assignedVisaManager: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

  // Stage Specific Details
  selectionMode: { type: String, enum: ['INTERVIEW', 'DIRECT_CV', 'NONE'], default: 'NONE' },
  
  initialInterview: {
    status: { type: String, enum: ['PENDING', 'PASS', 'FAIL'], default: 'PENDING' },
    remarks: { type: String, default: '' },
    updatedAt: { type: Date }
  },

  medicalDetails: {
    status: { type: String, enum: ['PENDING', 'FIT', 'UNFIT'], default: 'PENDING' },
    medicalFee: { type: Number, default: 0 },
    reportUrl: { type: String, default: '' },
    updatedAt: { type: Date }
  },

  finalInterview: {
    status: { type: String, enum: ['PENDING', 'CONFIRMED', 'NOT_CONFIRMED'], default: 'PENDING' },
    remarks: { type: String, default: '' },
    updatedAt: { type: Date }
  },

  paymentDetails: {
    serviceFee: { type: Number, default: 0 },
    medicalFee: { type: Number, default: 0 },
    advancePaid: { type: Number, default: 0 },
    totalPaid: { type: Number, default: 0 },
    paymentStatus: { type: String, enum: ['UNPAID', 'PARTIAL', 'FULL'], default: 'UNPAID' }
  },

  locationConfirmation: {
    confirmedLocation: { type: String, default: '' },
    editCount: { type: Number, default: 0, max: 4 }, // Max 4 edit attempts allowed by calling staff
    isConfirmed: { type: Boolean, default: false }
  },

  fileType: { 
    type: String, 
    enum: ['MOVE_FILE', 'DIRECT_FILE', 'NOT_SET'], 
    default: 'NOT_SET' 
  },

  visaDetails: {
    visaDate: { type: Date, default: null },
    isDateAssigned: { type: Boolean, default: false },
    revisionRequest: {
      isPending: { type: Boolean, default: false },
      requestedDate: { type: Date },
      reason: { type: String },
      requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    }
  },

  applicationForm: {
    trade: { type: String, default: '' },
    experienceYears: { type: Number, default: 0 },
    preferredCountries: [{ type: String }],
    fatherName: { type: String, default: '' },
    dob: { type: Date },
    address: { type: String, default: '' }
  },

  isHold: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('Lead', LeadSchema);
