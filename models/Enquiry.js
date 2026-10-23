const mongoose = require('mongoose');

const EnquirySchema = new mongoose.Schema({
  enquiryId: { type: String, required: true, unique: true }, // e.g., ENQ-1001
  candidateName: { type: String, required: true },
  phone: { type: String, required: true },
  email: { type: String, default: '' },
  trade: { type: String, default: '' },
  city: { type: String, default: '' },
  state: { type: String, default: '' },
  hasPassport: { type: String, enum: ['YES', 'NO', 'UNKNOWN'], default: 'UNKNOWN' },
  passportNumber: { type: String, default: '' },
  source: { type: String, default: 'ENQUIRY_RAISED' },
  category: { type: String, default: 'GENERAL' }, // e.g., GULF_JOB, VISA_ENQUIRY, MEDICAL_QUERY, DOCUMENT_STATUS
  subject: { type: String, default: '' },
  message: { type: String, required: true },
  
  // Role raising the enquiry
  raisedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  raisedByName: { type: String, required: true },
  raisedByRole: { type: String, required: true },
  raisedAt: { type: Date, default: Date.now },

  // Assigned / Target Role or User
  targetRole: { 
    type: String, 
    enum: ['ALL', 'DATA_CONTROLLER', 'STAFF_HEAD', 'CALLING_STAFF', 'INTERVIEW_PANEL', 'MEDICAL_DEPT', 'ACCOUNTS', 'PRE_VISA_MANAGER', 'VISA_MANAGER', 'VIVA_MANAGER', 'ADMIN'],
    default: 'DATA_CONTROLLER' 
  },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  assignedToName: { type: String, default: '' },

  // Status Lifecycle
  status: { 
    type: String, 
    enum: ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CONVERTED_TO_LEAD', 'CLOSED'], 
    default: 'OPEN' 
  },
  priority: { type: String, enum: ['LOW', 'NORMAL', 'HIGH', 'URGENT'], default: 'NORMAL' },
  
  // Follow-up / Conversion to Lead
  convertedLeadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', default: null },
  convertedLeadDisplayId: { type: String, default: '' },
  convertedAt: { type: Date, default: null },

  responses: [
    {
      respondedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      respondedByName: { type: String, required: true },
      respondedByRole: { type: String, required: true },
      responseNote: { type: String, required: true },
      respondedAt: { type: Date, default: Date.now }
    }
  ],
  resolutionNote: { type: String, default: '' },
  resolvedAt: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.model('Enquiry', EnquirySchema);
