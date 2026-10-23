const Enquiry = require('../models/Enquiry');
const Lead = require('../models/Lead');
const User = require('../models/User');

// Helper to generate enquiry ID
const generateEnquiryId = async () => {
  const count = await Enquiry.countDocuments();
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `ENQ-${count + 1}-${randomSuffix}`;
};

// @desc    Raise new enquiry (Available to all roles)
// @route   POST /api/enquiries
// @access  Private
exports.raiseEnquiry = async (req, res) => {
  try {
    const {
      candidateName,
      phone,
      email,
      trade,
      city,
      state,
      hasPassport,
      passportNumber,
      category,
      subject,
      message,
      targetRole,
      assignedTo,
      priority
    } = req.body;

    if (!candidateName || !phone || !message) {
      return res.status(400).json({
        success: false,
        message: 'Candidate Name, Phone Number, and Message/Details are mandatory to raise an enquiry.'
      });
    }

    const enquiryId = await generateEnquiryId();

    let targetUserName = '';
    if (assignedTo) {
      const u = await User.findById(assignedTo);
      if (u) targetUserName = u.name;
    }

    const enquiry = await Enquiry.create({
      enquiryId,
      candidateName: candidateName.trim(),
      phone: phone.trim(),
      email: email ? email.trim() : '',
      trade: trade ? trade.trim() : '',
      city: city ? city.trim() : '',
      state: state ? state.trim() : '',
      hasPassport: hasPassport || 'UNKNOWN',
      passportNumber: passportNumber ? passportNumber.trim() : '',
      category: category || 'GENERAL',
      subject: subject ? subject.trim() : `Enquiry regarding ${trade || 'Overseas Placement'}`,
      message: message.trim(),
      raisedBy: req.user._id,
      raisedByName: req.user.name || 'Staff User',
      raisedByRole: req.user.role || 'CALLING_STAFF',
      targetRole: targetRole || 'ALL',
      assignedTo: assignedTo || null,
      assignedToName: targetUserName,
      priority: priority || 'NORMAL',
      status: 'OPEN'
    });

    res.status(201).json({
      success: true,
      message: `Enquiry #${enquiry.enquiryId} raised successfully!`,
      data: enquiry
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get received enquiries for current user role or raised by current user
// @route   GET /api/enquiries
// @access  Private
exports.getEnquiries = async (req, res) => {
  try {
    const { type, status, priority, search, startDate, endDate } = req.query;
    const userRole = req.user.role;
    const userId = req.user._id;

    const conditions = [];

    // Filter by type: 'RECEIVED' (incoming to my role/desk) vs 'RAISED' (raised by me)
    if (type === 'RAISED') {
      conditions.push({ raisedBy: userId });
    } else {
      // Default: RECEIVED enquiries for this role or user
      // ADMIN, SUPER_ADMIN, and DATA_CONTROLLER have central intake visibility over all incoming enquiries
      if (userRole !== 'ADMIN' && userRole !== 'SUPER_ADMIN' && userRole !== 'DATA_CONTROLLER') {
        conditions.push({
          $or: [
            { targetRole: 'ALL' },
            { targetRole: userRole },
            { assignedTo: userId },
            { raisedBy: userId }
          ]
        });
      }
    }

    if (status && status !== 'ALL') {
      conditions.push({ status });
    }

    if (priority && priority !== 'ALL') {
      conditions.push({ priority });
    }

    // Date range filter
    if (startDate || endDate) {
      const dateQuery = {};
      if (startDate) {
        dateQuery.$gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        if (endDate.length <= 10) {
          end.setHours(23, 59, 59, 999);
        }
        dateQuery.$lte = end;
      }
      conditions.push({ createdAt: dateQuery });
    }

    // Search query
    if (search && search.trim()) {
      const s = search.trim();
      conditions.push({
        $or: [
          { enquiryId: { $regex: s, $options: 'i' } },
          { candidateName: { $regex: s, $options: 'i' } },
          { phone: { $regex: s, $options: 'i' } },
          { trade: { $regex: s, $options: 'i' } },
          { subject: { $regex: s, $options: 'i' } },
          { message: { $regex: s, $options: 'i' } }
        ]
      });
    }

    const query = conditions.length > 0 ? { $and: conditions } : {};

    const enquiries = await Enquiry.find(query)
      .populate('raisedBy', 'name email role phone')
      .populate('assignedTo', 'name email role phone')
      .sort({ createdAt: -1 });

    const totalCount = await Enquiry.countDocuments();
    const openCount = await Enquiry.countDocuments({ status: 'OPEN' });
    const inProgressCount = await Enquiry.countDocuments({ status: 'IN_PROGRESS' });
    const resolvedCount = await Enquiry.countDocuments({ status: 'RESOLVED' });

    res.json({
      success: true,
      count: enquiries.length,
      metrics: {
        total: totalCount,
        open: openCount,
        inProgress: inProgressCount,
        resolved: resolvedCount
      },
      data: enquiries
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Respond to an enquiry
// @route   POST /api/enquiries/:id/respond
// @access  Private
exports.respondToEnquiry = async (req, res) => {
  try {
    const { responseNote, status } = req.body;
    if (!responseNote || !responseNote.trim()) {
      return res.status(400).json({ success: false, message: 'Response note is required' });
    }

    const enquiry = await Enquiry.findById(req.params.id);
    if (!enquiry) {
      return res.status(404).json({ success: false, message: 'Enquiry not found' });
    }

    enquiry.responses.push({
      respondedBy: req.user._id,
      respondedByName: req.user.name,
      respondedByRole: req.user.role,
      responseNote: responseNote.trim(),
      respondedAt: new Date()
    });

    if (status) {
      enquiry.status = status;
    } else if (enquiry.status === 'OPEN') {
      enquiry.status = 'IN_PROGRESS';
    }

    if (enquiry.status === 'RESOLVED') {
      enquiry.resolvedAt = new Date();
      enquiry.resolutionNote = responseNote.trim();
    }

    await enquiry.save();

    res.json({
      success: true,
      message: 'Response recorded successfully',
      data: enquiry
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Convert an enquiry into an active candidate Lead
// @route   POST /api/enquiries/:id/convert-to-lead
// @access  Private
exports.convertToLead = async (req, res) => {
  try {
    const enquiry = await Enquiry.findById(req.params.id);
    if (!enquiry) {
      return res.status(404).json({ success: false, message: 'Enquiry not found' });
    }

    if (enquiry.status === 'CONVERTED_TO_LEAD') {
      return res.status(400).json({ success: false, message: 'This enquiry is already converted to a candidate lead.' });
    }

    // Check duplicate phone
    const existing = await Lead.findOne({ phone: enquiry.phone });
    if (existing) {
      enquiry.status = 'CONVERTED_TO_LEAD';
      enquiry.convertedLeadId = existing._id;
      enquiry.convertedLeadDisplayId = existing.leadId;
      enquiry.convertedAt = new Date();
      await enquiry.save();

      return res.json({
        success: true,
        message: `Existing Lead #${existing.leadId} found for this phone number. Linked enquiry to lead.`,
        data: existing
      });
    }

    // Generate Lead ID
    const count = await Lead.countDocuments();
    const leadId = `LEAD-${1000 + count + 1}`;

    const newLead = await Lead.create({
      leadId,
      candidateName: enquiry.candidateName,
      phone: enquiry.phone,
      email: enquiry.email || '',
      city: enquiry.city || '',
      state: enquiry.state || '',
      trade: enquiry.trade || '',
      source: 'MANUAL',
      isPassportHolder: enquiry.hasPassport === 'YES' ? 'YES' : (enquiry.hasPassport === 'NO' ? 'NO' : 'NOT_CONFIRMED'),
      passportNumber: enquiry.passportNumber || null,
      currentStage: 'UNASSIGNED',
      notes: `Converted from Enquiry #${enquiry.enquiryId}: ${enquiry.message}`
    });

    enquiry.status = 'CONVERTED_TO_LEAD';
    enquiry.convertedLeadId = newLead._id;
    enquiry.convertedLeadDisplayId = newLead.leadId;
    enquiry.convertedAt = new Date();
    await enquiry.save();

    res.status(201).json({
      success: true,
      message: `Enquiry successfully converted to Candidate Lead #${newLead.leadId}!`,
      data: newLead
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
