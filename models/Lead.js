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
    enum: ['YES', 'NO', 'NOT_CONFIRMED', 'NOT_INTERESTED'], 
    default: 'NOT_CONFIRMED' 
  },
  isFormFilled: { type: Boolean, default: false },
  formFilledAt: { type: Date, default: null },
  applicationForm: { type: mongoose.Schema.Types.Mixed, default: null },
  
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

  // Assignees & Active File Responsibility (FRD Section 1 & 7)
  activeHolder: {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    name: { type: String, default: 'Unassigned' },
    role: { type: String, default: 'NONE' },
    assignedAt: { type: Date, default: Date.now }
  },
  pendingTransfer: {
    hasPending: { type: Boolean, default: false },
    fromUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    fromUserName: { type: String, default: '' },
    toUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    toUserName: { type: String, default: '' },
    toRole: { type: String, default: '' },
    toStage: { type: String, default: '' },
    reason: { type: String, default: '' },
    pendingTasks: { type: String, default: '' },
    requestedAt: { type: Date, default: null },
    status: { type: String, enum: ['NONE', 'PENDING', 'ACCEPTED', 'RETURNED'], default: 'NONE' },
    returnReason: { type: String, default: '' }
  },
  closureStatus: {
    type: String,
    enum: ['ACTIVE', 'CLOSED_NO_ADVANCE', 'REFUND_PENDING', 'FINANCIAL_PENDING', 'FINAL_CLOSED'],
    default: 'ACTIVE'
  },
  closureDetails: {
    closedAt: { type: Date },
    reason: { type: String, default: '' },
    closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    refundPayable: { type: Number, default: 0 },
    refundPaid: { type: Number, default: 0 },
    refundBalance: { type: Number, default: 0 },
    settlementDate: { type: Date }
  },
  assignedStaffHead: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  assignedCallingStaff: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  assignedInterviewPanel: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  assignedPreVisaManager: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  assignedVisaManager: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

  // Stage Specific Details
  selectionMode: { type: String, enum: ['INTERVIEW', 'DIRECT_CV', 'NONE'], default: 'NONE' },
  
  initialInterview: {
    status: { type: String, enum: ['PENDING', 'PASS', 'FAIL', 'ON_HOLD'], default: 'PENDING' },
    remarks: { type: String, default: '' },
    technicalScore: { type: Number, default: 0 },
    communicationScore: { type: Number, default: 0 },
    physicalFitness: { type: String, default: '' },
    offeredSalary: { type: String, default: '' },
    rejectionReason: { type: String, default: '' },
    interviewerName: { type: String, default: '' },
    updatedAt: { type: Date }
  },

  medicalDetails: {
    status: { type: String, enum: ['PENDING', 'SCHEDULED', 'FIT', 'UNFIT'], default: 'PENDING' },
    center: { type: String, default: '' },
    appointmentDate: { type: Date, default: null },
    slipNo: { type: String, default: '' },
    medicalFee: { type: Number, default: 0 },
    reportUrl: { type: String, default: '' },
    isReportSent: { type: Boolean, default: false },
    reportSentAt: { type: Date, default: null },
    validity: { type: String, default: '' },
    remarks: { type: String, default: '' },
    tests: [{
      id: { type: String },
      title: { type: String },
      subtitle: { type: String, default: '' },
      status: { type: String, enum: ['Pending', 'In Process', 'Completed'], default: 'Pending' },
      remarks: { type: String, default: '' },
      updatedAt: { type: Date, default: Date.now }
    }],
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
    totalFee: { type: Number, default: 0 },
    balanceDue: { type: Number, default: 0 },
    paymentStatus: { type: String, enum: ['UNPAID', 'PARTIAL', 'FULL'], default: 'UNPAID' },
    paymentMode: { type: String, default: 'UPI' },
    receiptNo: { type: String, default: '' },
    lastPaymentDate: { type: Date, default: null },
    afterAdvanceConfirmed: { type: Boolean, default: false },
    recordingConfirmed: { type: Boolean, default: false },
    recordingUrl: { type: String, default: '' },
    history: [
      {
        amount: { type: Number, required: true },
        paymentMode: { type: String, default: 'UPI' },
        receiptNo: { type: String },
        remarks: { type: String },
        recordedBy: { type: String },
        date: { type: Date, default: Date.now }
      }
    ]
  },

  // Step 8: Company Confirmation & Proposal/Agreement (FRD Section 4, Step 8)
  companyConfirmation: {
    status: { type: String, enum: ['PENDING', 'PROPOSAL_SENT', 'AGREEMENT_ACCEPTED', 'REJECTED'], default: 'PENDING' },
    companyName: { type: String, default: '' },
    positionOffered: { type: String, default: '' },
    proposalDate: { type: Date, default: null },
    acceptanceDate: { type: Date, default: null },
    terms: { type: String, default: '' },
    agreementPdfUrl: { type: String, default: '' },
    recordingUrl: { type: String, default: '' },
    updatedAt: { type: Date, default: null }
  },

  // 8 Mandatory PDF & Recording Confirmations (FRD Section 8)
  confirmations: [
    {
      docType: { 
        type: String, 
        required: true
      },
      title: { type: String, default: '' },
      status: { type: String, enum: ['GENERATED', 'SHARED', 'CLIENT_CONFIRMED', 'NOT_STARTED'], default: 'GENERATED' },
      version: { type: Number, default: 1 },
      generatedAt: { type: Date, default: Date.now },
      sharedAt: { type: Date, default: null },
      sharedChannel: { type: String, default: 'WHATSAPP' },
      confirmedAt: { type: Date, default: null },
      pdfUrl: { type: String, default: '' },
      recordingUrl: { type: String, default: '' },
      recordingType: { type: String, default: 'CALL_RECORDING' },
      remarks: { type: String, default: '' },
      handledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      handledByName: { type: String, default: 'Staff' }
    }
  ],

  // Step 6-9: Formal Bill Book & Financial Ledger (FRD Section 9)
  billBook: {
    isLedgerOpen: { type: Boolean, default: false },
    openedAt: { type: Date, default: null },
    approvedPayable: { type: Number, default: 0 },
    totalReceived: { type: Number, default: 0 },
    balanceDue: { type: Number, default: 0 },
    approvedRefund: { type: Number, default: 0 },
    refundPaid: { type: Number, default: 0 },
    refundBalance: { type: Number, default: 0 },
    charges: [
      {
        head: { type: String, enum: ['MEDICAL', 'PROCESSING', 'VERIFICATION', 'ADVANCE', 'VISA', 'TICKET', 'SERVICE', 'OTHER'], default: 'SERVICE' },
        amount: { type: Number, required: true },
        description: { type: String, default: '' },
        addedAt: { type: Date, default: Date.now }
      }
    ],
    transactions: [
      {
        receiptNo: { type: String, required: true },
        type: { type: String, enum: ['PAYMENT', 'REFUND', 'REVERSAL', 'ADJUSTMENT', 'ADVANCE', 'STAGE_PAYMENT', 'FINAL', 'MEDICAL', 'VISA'], default: 'PAYMENT' },
        head: { type: String, default: 'ADVANCE' },
        amount: { type: Number, required: true },
        paymentMode: { type: String, default: 'UPI' },
        referenceNo: { type: String, default: '' },
        status: { type: String, enum: ['PENDING_VERIFICATION', 'VERIFIED'], default: 'PENDING_VERIFICATION' },
        receiptUrl: { type: String, default: '' },
        receivedBy: { type: String, default: '' },
        verifiedBy: { type: String, default: '' },
        verifiedAt: { type: Date, default: null },
        remarks: { type: String, default: '' },
        afterAdvanceConfirmed: { type: Boolean, default: false },
        recordingConfirmed: { type: Boolean, default: false },
        recordingUrl: { type: String, default: '' },
        date: { type: Date, default: Date.now }
      }
    ]
  },

  locationConfirmation: {
    confirmedLocation: { type: String, default: '' },
    editCount: { type: Number, default: 0, max: 4 }, // Max 4 edit attempts allowed by calling staff
    isConfirmed: { type: Boolean, default: false },
    medicalPdfShared: { type: Boolean, default: false },
    medicalConditionsExplained: { type: Boolean, default: false },
    recordingConfirmed: { type: Boolean, default: false },
    recordingUrl: { type: String, default: '' },
    confirmedAt: { type: Date, default: null }
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
    expiryDate: { type: Date, default: null },
    visaNumber: { type: String, default: '' },
    notifiedToStaffHead: { type: Boolean, default: false },
    staffHeadNotifiedAt: { type: Date, default: null },
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
      expectedFlightDate: { type: Date, default: null },
      confirmedTicketDate: { type: Date, default: null },
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
      videoAgreementVerified: { type: Boolean, default: false },
      videoAgreementDeclared: { type: Boolean, default: false },
      videoAgreementRecordingUrl: { type: String, default: '' },
      videoAgreementStatus: { type: String, enum: ['VERIFIED', 'DECLARED', 'PENDING'], default: 'PENDING' },
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
    previousCountry: { type: String, default: '' },
    photoUrl: { type: String, default: '' },
    signatureUrl: { type: String, default: '' },
    hasPhoto: { type: Boolean, default: false },
    hasSignature: { type: Boolean, default: false }
  },

  photoUrl: { type: String, default: '' },
  signatureUrl: { type: String, default: '' },
  documents: [
    {
      name: { type: String },
      title: { type: String },
      fileName: { type: String },
      fileUrl: { type: String },
      fileSize: { type: String },
      category: { type: String, default: 'Other' },
      status: { type: String, default: 'VERIFIED' },
      uploadedAt: { type: Date, default: Date.now },
      uploadedBy: { type: String, default: 'Staff' }
    }
  ],

  isHold: { type: Boolean, default: false },
  holdReason: { type: String, default: '' },

  // Formal File Closure & Dynamic Refund Settlement System
  closureStatus: {
    type: String,
    enum: ['ACTIVE', 'CLOSED_NO_ADVANCE', 'REFUND_PENDING', 'FINANCIAL_PENDING', 'FINAL_CLOSED'],
    default: 'ACTIVE'
  },
  scheduledRefundDate: { type: Date, default: null },
  closureDetails: {
    closedAt: { type: Date },
    reason: { type: String, default: '' },
    closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    refundPayable: { type: Number, default: 0 },
    refundPaid: { type: Number, default: 0 },
    refundBalance: { type: Number, default: 0 },
    scheduledRefundDate: { type: Date, default: null },
    isRefundMarked: { type: Boolean, default: false },
    settlementDate: { type: Date, default: null },
    bankDetails: {
      accountHolderName: { type: String, default: '' },
      bankName: { type: String, default: '' },
      accountNumber: { type: String, default: '' },
      ifscCode: { type: String, default: '' },
      upiId: { type: String, default: '' }
    }
  },

  // FRD Section 6 & 11: Multi-Application & Re-Apply Tracking System
  // One candidate can have multiple applications across time without overwriting prior history
  currentApplicationId: { type: String, default: 'APP-01' },
  totalApplicationsCount: { type: Number, default: 1 },
  isReapply: { type: Boolean, default: false },

  applications: [{
    applicationId: { type: String, required: true },
    appliedAt: { type: Date, default: Date.now },
    closedAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ['ACTIVE', 'COMPLETED', 'CANCELLED', 'REAPPLIED', 'MOVED', 'ON_HOLD'],
      default: 'ACTIVE'
    },
    reasonForMove: { type: String, default: '' },
    companyName: { type: String, default: '' },
    targetCountry: { type: String, default: '' },
    trade: { type: String, default: '' },
    salaryOffered: { type: String, default: '' },
    stageReached: { type: String, default: 'CALLING_QUEUE' },
    fileType: { type: String, default: 'FRESH' },
    financials: {
      serviceFee: { type: Number, default: 0 },
      advancePaid: { type: Number, default: 0 },
      totalPaid: { type: Number, default: 0 },
      balanceDue: { type: Number, default: 0 },
      adjustmentCarriedForward: { type: Number, default: 0 }
    },
    handledBy: { type: String, default: '' },
    confirmationsCount: { type: Number, default: 0 },
    remarks: { type: String, default: '' },
    archivedSnapshot: { type: mongoose.Schema.Types.Mixed, default: {} }
  }]
}, { timestamps: true });

module.exports = mongoose.model('Lead', LeadSchema);
