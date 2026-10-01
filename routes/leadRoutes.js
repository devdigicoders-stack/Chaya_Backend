const express = require('express');
const router = express.Router();
const {
  createLeads,
  bulkImportLeads,
  getLeadById,
  updateLead,
  deleteLead,
  toggleLeadHold,
  assignLeadsToCallingStaff,
  distributeLeadsRoundRobin,
  reassignLeadCallingStaff,
  bulkReassignCallingStaff,
  categorizeLead,
  transferLeadStage,
  updateLocationConfirmation,
  submitInterviewResult,
  scheduleMedicalAppointment,
  checkInMedicalCandidate,
  saveMedicalTests,
  submitMedicalResult,
  recordPaymentBooking,
  recordFinalPayment,
  verifyPreVivaDocs,
  uploadLeadDocument,
  assignPreVivaVisa,
  evaluatePreVivaCandidate,
  confirmVisaDelay,
  applyVisa,
  updateVisaStatus,
  verifyVisaDocuments,
  updateVisaTracking,
  schedulePlacementViva,
  submitPlacementVivaResult,
  issuePlacementOfferLetter,
  updatePlacementDeployment,
  getLeads,
  getAdminDashboardSummary,
  adminLeadOverride
} = require('../controllers/leadController');
const { protect, authorize } = require('../middleware/authMiddleware');
const validateTransferChecklist = require('../middleware/checkTransferChecklist');
const documentUpload = require('../middleware/documentUploadMiddleware');

// 1. Core Lead Retrieval & Stats
router.get('/', protect, getLeads);
router.get('/admin/dashboard-summary', protect, authorize('ADMIN', 'DATA_CONTROLLER', 'STAFF_HEAD'), getAdminDashboardSummary);
router.get('/:id', protect, getLeadById);

// 2. Ingestion & Bulk Import
router.post('/', protect, authorize('ADMIN', 'DATA_CONTROLLER', 'CALLING_STAFF', 'STAFF_HEAD'), createLeads);
router.post('/bulk-import', protect, authorize('ADMIN', 'DATA_CONTROLLER', 'STAFF_HEAD'), bulkImportLeads);

// 3. Staff Assignment & Workflow Moves (FRD Section 6 & 12)
router.post('/assign-staff', protect, authorize('ADMIN', 'STAFF_HEAD'), assignLeadsToCallingStaff);
router.post('/distribute-round-robin', protect, authorize('ADMIN', 'STAFF_HEAD'), distributeLeadsRoundRobin);
router.post('/bulk-reassign-staff', protect, authorize('ADMIN', 'STAFF_HEAD'), bulkReassignCallingStaff);
router.put('/:id/reassign-staff', protect, authorize('ADMIN', 'STAFF_HEAD'), reassignLeadCallingStaff);
router.put('/:id/categorize', protect, categorizeLead);
router.put('/:id/transfer', protect, validateTransferChecklist, transferLeadStage);
router.put('/:id/location-confirmation', protect, updateLocationConfirmation);
router.put('/:id/interview-result', protect, authorize('ADMIN', 'INTERVIEW_PANEL', 'STAFF_HEAD'), submitInterviewResult);

// 4. Medical & Payment Booking Routes (FRD Section 11 & 12)
router.put('/:id/medical-schedule', protect, scheduleMedicalAppointment);
router.put('/:id/medical-checkin', protect, checkInMedicalCandidate);
router.put('/:id/medical-tests', protect, saveMedicalTests);
router.put('/:id/medical-result', protect, submitMedicalResult);
router.put('/:id/payment-booking', protect, recordPaymentBooking);
router.put('/:id/final-payment', protect, recordFinalPayment);

// 5. Pre-Viva Management Routes (FRD Step 15)
router.put('/:id/pre-viva-verify', protect, verifyPreVivaDocs);
router.post('/:id/upload-document', protect, documentUpload.single('document'), uploadLeadDocument);
router.put('/:id/pre-viva-assign', protect, assignPreVivaVisa);
router.put('/:id/pre-viva-evaluate', protect, evaluatePreVivaCandidate);
router.put('/:id/pre-viva-delay', protect, confirmVisaDelay);

// 6. Visa Processing Routes (FRD Step 16)
router.put('/:id/visa-apply', protect, applyVisa);
router.put('/:id/visa-status', protect, updateVisaStatus);
router.put('/:id/visa-documents', protect, verifyVisaDocuments);
router.put('/:id/visa-tracking', protect, updateVisaTracking);

// 7. Viva & Placement Routes (FRD Step 17 - 20)
router.put('/:id/placement-viva-schedule', protect, schedulePlacementViva);
router.put('/:id/placement-viva-result', protect, submitPlacementVivaResult);
router.put('/:id/placement-offer-letter', protect, issuePlacementOfferLetter);
router.put('/:id/placement-deployment', protect, updatePlacementDeployment);

// 4. Lead Editing, Hold & Deletion
router.put('/:id/hold', protect, toggleLeadHold);
router.put('/:id/admin-override', protect, authorize('ADMIN'), adminLeadOverride);
router.put('/:id', protect, updateLead);
router.delete('/:id', protect, authorize('ADMIN'), deleteLead);

module.exports = router;
