const User = require('../models/User');
const jwt = require('jsonwebtoken');

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });
};

// @desc    Register / Create a new user (ADMIN ONLY CAN CREATE USERS)
// @route   POST /api/auth/register
// @access  Private (Admin Only)
exports.registerUser = async (req, res) => {
  try {
    const { name, email, phone, password, role, teamHeadId } = req.body;

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ success: false, message: 'User already exists with this email' });
    }

    const user = await User.create({
      name,
      email,
      phone,
      password,
      role,
      teamHeadId: teamHeadId || null
    });

    res.status(201).json({
      success: true,
      message: `User '${user.name}' with role '${user.role}' created successfully by Admin`,
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        teamHeadId: user.teamHeadId
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Auth user & get token
// @route   POST /api/auth/login
// @access  Public
exports.loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (user && (await user.matchPassword(password))) {
      res.json({
        success: true,
        data: {
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          token: generateToken(user._id)
        }
      });
    } else {
      res.status(401).json({ success: false, message: 'Invalid email or password' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get current user profile
// @route   GET /api/auth/profile
// @access  Private
exports.getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get all users list (ADMIN ONLY)
// @route   GET /api/auth/users
// @access  Private (Admin Only)
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.json({ success: true, count: users.length, data: users });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get calling staff team under a Staff Head
// @route   GET /api/auth/team/:staffHeadId
// @access  Private
exports.getTeamStaff = async (req, res) => {
  try {
    const staffMembers = await User.find({ teamHeadId: req.params.staffHeadId, role: 'CALLING_STAFF' });
    res.json({ success: true, count: staffMembers.length, data: staffMembers });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
