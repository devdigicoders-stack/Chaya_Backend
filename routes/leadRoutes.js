const express = require('express');
const router = express.Router();
const {
  createLeads,
  assignLeadsToCallingStaff,
  categorizeLead,
  transferLeadStage,
  updateLocationConfirmation,
  getLeads,
  getAdminDashboardSummary,
  adminLeadOverride
} = require('../controllers/leadController');
const { protect, authorize } = require('../middleware/authMiddleware');
const validateTransferChecklist = require('../middleware/checkTransferChecklist');

router.get('/', protect, getLeads);
router.get('/admin/dashboard-summary', protect, authorize('ADMIN', 'DATA_CONTROLLER'), getAdminDashboardSummary);

// Lead Ingestion allowed for ADMIN, DATA_CONTROLLER, CALLING_STAFF (Sales), and STAFF_HEAD
router.post('/', protect, authorize('ADMIN', 'DATA_CONTROLLER', 'CALLING_STAFF', 'STAFF_HEAD'), createLeads);

// Staff Head Manual Lead Assignment to Calling Staff
router.post('/assign-staff', protect, authorize('ADMIN', 'STAFF_HEAD'), assignLeadsToCallingStaff);

router.put('/:id/categorize', protect, categorizeLead);
router.put('/:id/transfer', protect, validateTransferChecklist, transferLeadStage);
router.put('/:id/location-confirmation', protect, updateLocationConfirmation);
router.put('/:id/admin-override', protect, authorize('ADMIN'), adminLeadOverride);

module.exports = router;
