const express = require('express');
const router = express.Router();
const { getLeadHistory } = require('../controllers/historyController');
const { protect } = require('../middleware/authMiddleware');

router.get('/lead/:leadId', protect, getLeadHistory);

module.exports = router;
