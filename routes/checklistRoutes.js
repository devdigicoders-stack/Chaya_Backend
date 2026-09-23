const express = require('express');
const router = express.Router();
const { getAllChecklists, getChecklistForTransition, saveChecklistConfig } = require('../controllers/checklistController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.get('/', protect, getAllChecklists);
router.get('/transition', protect, getChecklistForTransition);
router.post('/', protect, authorize('ADMIN'), saveChecklistConfig);

module.exports = router;
