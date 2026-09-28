const express = require('express');
const router = express.Router();
const { getLeadHistory, getAllHistory, getUserHistory } = require('../controllers/historyController');
const { protect } = require('../middleware/authMiddleware');

router.get('/', protect, getAllHistory);
router.get('/lead/:leadId', protect, getLeadHistory);
router.get('/user/:userId', protect, getUserHistory);

module.exports = router;
