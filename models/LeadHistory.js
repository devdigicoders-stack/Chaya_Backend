const mongoose = require('mongoose');

const LeadHistorySchema = new mongoose.Schema({
  lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true },
  leadIdStr: { type: String, required: true }, // Fast human readable search
  
  performedBy: {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    role: { type: String, required: true }
  },

  actionType: {
    type: String,
    enum: [
      'LEAD_CREATED',
      'LEAD_ASSIGNED',
      'LEAD_SWAPPED',
      'CATEGORIZED',
      'APPLICATION_FORM_FILLED',
      'SELECTION_MODE_SET',
      'INITIAL_INTERVIEW_RESULT',
      'MEDICAL_RESULT',
      'FINAL_INTERVIEW_RESULT',
      'PAYMENT_ADDED',
      'LOCATION_EDITED',
      'STAGE_TRANSFERRED',
      'VISA_DATE_ASSIGNED',
      'VISA_DATE_REVISION_REQUESTED',
      'VISA_DATE_REVISION_APPROVED',
      'HOLD_STATUS_CHANGED',
      'PRE_VIVA_DOCS_VERIFIED',
      'PRE_VIVA_ASSIGNED',
      'PRE_VIVA_EVALUATED',
      'VISA_DELAY_CONFIRMED',
      'VISA_DELAY_CANCELLED',
      'VISA_APPLICATION_SUBMITTED',
      'VISA_STATUS_UPDATED',
      'VISA_DOCUMENT_VERIFIED',
      'VISA_TRACKING_UPDATED',
      'VIVA_SCHEDULED',
      'VIVA_RESULT_SUBMITTED',
      'OFFER_LETTER_ISSUED',
      'OFFER_LETTER_STATUS_UPDATED',
      'FLIGHT_JOINING_UPDATED',
      'FINAL_PAYMENT_RECORDED',
      'FILE_CLOSED',
      'REFUND_DISBURSED',
      'CONFIRMATION_UPDATED',
      'REAPPLIED_NEW_CYCLE',
      'CANDIDATE_CANCELLED',
      'CANDIDATE_PLACED_ON_HOLD'
    ],
    required: true
  },

  fromStage: { type: String, default: null },
  toStage: { type: String, default: null },

  // Array of checklist tick marks completed during transfer
  completedChecklist: [{
    itemKey: { type: String },
    label: { type: String },
    isChecked: { type: Boolean, default: true }
  }],

  remarks: { type: String, default: '' },
  
  // Data changes snapshot for audit
  changes: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

module.exports = mongoose.model('LeadHistory', LeadHistorySchema);
