const express = require('express');
const router = express.Router();
const {
  registerAdmin,
  registerUser,
  loginUser,
  getUserProfile,
  updateUserProfile,
  changePassword,
  getAllUsers,
  getTeamStaff,
  updateUser,
  toggleUserStatus,
  deleteUser,
  getLoginHistory,
  terminateSession,
  terminateStaleSessions,
  getPublicRoles
} = require('../controllers/authController');
const { protect, authorize } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

// Public Auth Routes
router.post('/login', loginUser);
router.get('/roles', getPublicRoles);

// Authenticated User Profile & Security Routes
router.get('/profile', protect, getUserProfile);
router.put('/profile', protect, upload.single('avatar'), updateUserProfile);
router.put('/change-password', protect, changePassword);

// Staff Session & Login Audit Tracking Routes
router.get('/login-history', protect, authorize('ADMIN'), getLoginHistory);
router.put('/login-history/:id/terminate', protect, authorize('ADMIN'), terminateSession);
router.post('/login-history/terminate-stale', protect, authorize('ADMIN'), terminateStaleSessions);

// ADMIN & STAFF HEAD User Management Routes
router.post('/register', protect, authorize('ADMIN'), upload.single('avatar'), registerUser);
router.get('/users', protect, authorize('ADMIN', 'STAFF_HEAD', 'DATA_CONTROLLER'), getAllUsers);
router.put('/users/:id', protect, authorize('ADMIN'), upload.single('avatar'), updateUser);
router.put('/users/:id/toggle-status', protect, authorize('ADMIN'), toggleUserStatus);
router.delete('/users/:id', protect, authorize('ADMIN'), deleteUser);

// Team Hierarchy Route
router.get('/team/:staffHeadId', protect, getTeamStaff);

module.exports = router;
