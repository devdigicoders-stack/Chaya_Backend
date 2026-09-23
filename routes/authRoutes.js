const express = require('express');
const router = express.Router();
const { registerUser, loginUser, getUserProfile, getAllUsers, getTeamStaff } = require('../controllers/authController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.post('/login', loginUser);
router.get('/profile', protect, getUserProfile);

// ADMIN ONLY CAN CREATE USERS & VIEW ALL USERS LIST
router.post('/register', protect, authorize('ADMIN'), registerUser);
router.get('/users', protect, authorize('ADMIN'), getAllUsers);

router.get('/team/:staffHeadId', protect, getTeamStaff);

module.exports = router;
