const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  raiseEnquiry,
  getEnquiries,
  respondToEnquiry,
  convertToLead
} = require('../controllers/enquiryController');

// All authenticated roles can raise and view their enquiries
router.post('/', protect, raiseEnquiry);
router.get('/', protect, getEnquiries);
router.post('/:id/respond', protect, respondToEnquiry);
router.post('/:id/convert-to-lead', protect, convertToLead);

module.exports = router;
