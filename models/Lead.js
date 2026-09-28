const mongoose = require('mongoose');

const LeadSchema = new mongoose.Schema({
  leadId: { type: String, required: true, unique: true }, // e.g., LEAD-1001
  source: { 
    type: String, 
    enum: ['WHATSAPP', 'FACEBOOK', 'EXCEL', 'MANUAL', 'AGENT_REFERRAL', 'WALK_IN', 'OTHER'], 
    default: 'MANUAL' 
  },
  candidateName: { type: String, required: true },
  phone: { type: String, required: true },
  email: { type: String, default: '' },
  city: { type: String, default: '' },
  state: { type: String, default: '' },
  trade: { type: String, default: '' },
  notes: { type: String, default: '' },
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
      'VIVA_PLACEMENT',
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
    status: { type: String, enum: ['PENDING', 'SCHEDULED', 'FIT', 'UNFIT'], default: 'PENDING' },
    center: { type: String, default: '' },
    appointmentDate: { type: Date, default: null },
    slipNo: { type: String, default: '' },
    medicalFee: { type: Number, default: 0 },
    reportUrl: { type: String, default: '' },
    validity: { type: String, default: '' },
    remarks: { type: String, default: '' },
    updatedAt: { type: Date }
  },

  finalInterview: {
    status: { type: String, enum: ['PENDING', 'CONFIRMED', 'NOT_CONFIRMED'], default: 'PENDING' },
    remarks: { type: String, default: '' },
    updatedAt: { type: Date }
  },

  paymentDetails: {
    serviceFee: { type: Number, default: 0 },
    servicePaid: { type: Number, default: 0 },
    medicalFee: { type: Number, default: 0 },
    medicalPaid: { type: Number, default: 0 },
    advancePaid: { type: Number, default: 0 },
    totalPaid: { type: Number, default: 0 },
    paymentStatus: { type: String, enum: ['UNPAID', 'PARTIAL', 'FULL'], default: 'UNPAID' },
    paymentMode: { type: String, default: 'UPI' },
    receiptNo: { type: String, default: '' },
    lastPaymentDate: { type: Date, default: null }
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
    applicationNumber: { type: String, default: '' },
    visaType: { type: String, default: 'Work Permit Visa' },
    country: { type: String, default: '' },
    embassy: { type: String, default: '' },
    appliedOn: { type: Date, default: null },
    expectedDate: { type: Date, default: null },
    stampedDate: { type: Date, default: null },
    fee: { type: String, default: '' },
    status: {
      type: String,
      enum: ['READY_TO_APPLY', 'SUBMITTED', 'PROCESSING', 'APPROVED', 'DELAYED', 'REJECTED'],
      default: 'READY_TO_APPLY'
    },
    trackingStage: { type: Number, default: 1, min: 1, max: 5 },
    remarks: { type: String, default: '' },
    trackingHistory: [
      {
        date: { type: Date, default: Date.now },
        stage: { type: Number },
        event: { type: String },
        user: { type: String }
      }
    ],
    verifiedDocuments: [
      {
        docKey: { type: String },
        name: { type: String },
        fileName: { type: String },
        status: { type: String, enum: ['VERIFIED', 'MISSING', 'PENDING'], default: 'PENDING' },
        verifiedBy: { type: String },
        verifiedAt: { type: Date },
        mandatory: { type: Boolean, default: true }
      }
    ],
    revisionRequest: {
      isPending: { type: Boolean, default: false },
      requestedDate: { type: Date },
      reason: { type: String },
      requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    }
  },

  preVivaDetails: {
    documentsVerified: { type: Boolean, default: false },
    verifiedAt: { type: Date, default: null },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    vivaDate: { type: Date, default: null },
    assignedVisaManager: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    visaManagerName: { type: String, default: '' },
    status: { 
      type: String, 
      enum: ['PENDING_VERIFICATION', 'READY_FOR_VISA', 'SCHEDULED', 'CLEARED', 'RETEST_HOLD'], 
      default: 'PENDING_VERIFICATION' 
    },
    score: { type: Number, default: 0 },
    panelMember: { type: String, default: '' },
    remarks: { type: String, default: '' },
    delayHistory: [
      {
        attempt: { type: Number, default: 1 },
        expectedDate: { type: Date },
        delayDate: { type: Date },
        reason: { type: String },
        user: { type: String },
        confirmedReadyAt: { type: Date },
        candidateRemarks: { type: String }
      }
    ]
  },

  placementDetails: {
    // 1. Client Final Viva Schedule (Step 17)
    vivaSchedule: {
      vivaId: { type: String, default: '' },
      company: { type: String, default: '' },
      country: { type: String, default: '' },
      date: { type: Date, default: null },
      time: { type: String, default: '' },
      mode: { type: String, default: 'Foreign Delegate' },
      panel: { type: String, default: '' },
      room: { type: String, default: 'Interview Hall A' },
      status: {
        type: String,
        enum: ['SCHEDULED', 'RESCHEDULED', 'COMPLETED', 'CANCELLED'],
        default: 'SCHEDULED'
      },
      remarks: { type: String, default: '' },
      scheduledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      scheduledAt: { type: Date, default: null }
    },

    // 2. Client Final Viva Results & Scorecard
    vivaResult: {
      resId: { type: String, default: '' },
      score: { type: Number, default: null },
      breakdown: {
        skill: { type: Number, default: 0 },
        theory: { type: Number, default: 0 },
        safety: { type: Number, default: 0 },
        comm: { type: Number, default: 0 }
      },
      status: {
        type: String,
        enum: ['PENDING', 'SELECTED', 'ON_HOLD', 'NOT_SELECTED'],
        default: 'PENDING'
      },
      remarks: { type: String, default: '' },
      evaluatedBy: { type: String, default: '' },
      evaluatedAt: { type: Date, default: null }
    },

    // 3. Foreign Offer Letter
    offerLetter: {
      offId: { type: String, default: '' },
      company: { type: String, default: '' },
      country: { type: String, default: '' },
      job: { type: String, default: '' },
      basicSalary: { type: String, default: '' },
      allowance: { type: String, default: '' },
      totalSalary: { type: String, default: '' },
      food: { type: String, default: 'Company Provided' },
      accommodation: { type: String, default: 'Company Provided' },
      contractYears: { type: String, default: '2 Years (Renewable)' },
      issuedOn: { type: Date, default: null },
      expiresOn: { type: Date, default: null },
      status: {
        type: String,
        enum: ['NOT_ISSUED', 'DRAFT', 'SENT', 'ACCEPTED', 'REJECTED'],
        default: 'NOT_ISSUED'
      },
      notes: { type: String, default: '' }
    },

    // 4. Flight Booking & On-Site Joining Deployment (Step 19 / 20)
    deployment: {
      deployId: { type: String, default: '' },
      company: { type: String, default: '' },
      country: { type: String, default: '' },
      airline: { type: String, default: '' },
      flightNumber: { type: String, default: '' },
      pnr: { type: String, default: '' },
      sector: { type: String, default: '' },
      departureAirport: { type: String, default: '' },
      arrivalAirport: { type: String, default: '' },
      flightDate: { type: Date, default: null },
      flightTime: { type: String, default: '' },
      joiningDate: { type: Date, default: null },
      poeStatus: { type: String, default: 'POE Cleared' },
      baggage: { type: String, default: '30 KG Check-in + 7 KG Cabin' },
      pickupOfficer: { type: String, default: '' },
      campLocation: { type: String, default: '' },
      status: {
        type: String,
        enum: ['PENDING_TICKET', 'FLIGHT_BOOKED', 'DEPARTED', 'JOINED_ON_SITE', 'NO_SHOW'],
        default: 'PENDING_TICKET'
      },
      notes: { type: String, default: '' }
    }
  },

  applicationForm: {
    trade: { type: String, default: '' },
    experienceYears: { type: String, default: '' },
    preferredCountries: [{ type: String }],
    expectedSalary: { type: String, default: '' },
    fatherName: { type: String, default: '' },
    dob: { type: String, default: '' },
    gender: { type: String, default: 'Male' },
    altPhone: { type: String, default: '' },
    address: { type: String, default: '' },
    city: { type: String, default: '' },
    state: { type: String, default: '' },
    passportIssueDate: { type: String, default: '' },
    passportExpiry: { type: String, default: '' },
    hasPreviousGCC: { type: String, default: 'No' },
    previousCountry: { type: String, default: '' }
  },

  isHold: { type: Boolean, default: false },
  holdReason: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('Lead', LeadSchema);
