const LeadHistory = require('../models/LeadHistory');
const Lead = require('../models/Lead');
const User = require('../models/User');
const LoginHistory = require('../models/LoginHistory');

// @desc    Get complete audit timeline history for a specific lead
// @route   GET /api/history/lead/:leadId
// @access  Private
exports.getLeadHistory = async (req, res) => {
  try {
    const { leadId } = req.params;

    // Find lead document by Mongo ID or human readable String (e.g. LEAD-1016)
    let leadDoc = null;
    if (leadId.match(/^[0-9a-fA-F]{24}$/)) {
      leadDoc = await Lead.findById(leadId);
    } else {
      leadDoc = await Lead.findOne({ leadId: leadId });
    }

    if (!leadDoc) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }

    const history = await LeadHistory.find({ 
      $or: [
        { lead: leadDoc._id }, 
        { leadIdStr: leadDoc.leadId }
      ] 
    }).sort({ createdAt: -1 });

    res.json({ success: true, count: history.length, data: history });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get global immutable activity & audit trail across all 19 recruitment steps
// @route   GET /api/history
// @access  Private
exports.getAllHistory = async (req, res) => {
  try {
    const { 
      search = '', 
      actionType = 'ALL', 
      category = 'ALL',
      role = 'ALL', 
      page = 1, 
      limit = 200 
    } = req.query;

    const query = {};

    // Filter by actionType
    if (actionType && actionType !== 'ALL') {
      query.actionType = actionType;
    }

    // Role filter
    if (role && role !== 'ALL') {
      query['performedBy.role'] = role;
    }

    // Specific User filter
    if (req.query.userId) {
      query['performedBy.userId'] = req.query.userId;
    }

    // Search filter across candidate ID, remarks, performer, actionType, stages
    if (search && search.trim()) {
      const s = search.trim();
      query.$or = [
        { leadIdStr: { $regex: s, $options: 'i' } },
        { remarks: { $regex: s, $options: 'i' } },
        { 'performedBy.name': { $regex: s, $options: 'i' } },
        { 'performedBy.role': { $regex: s, $options: 'i' } },
        { actionType: { $regex: s, $options: 'i' } },
        { fromStage: { $regex: s, $options: 'i' } },
        { toStage: { $regex: s, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const totalCount = await LeadHistory.countDocuments(query);

    const history = await LeadHistory.find(query)
      .populate('lead', 'candidateName name leadId passportNumber trade jobTitle phone primaryPhone source currentStage assignedStaffHead assignedCallingStaff')
      .populate('performedBy.userId', 'name email role department')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // High level summary stats across database
    const totalAllLogs = await LeadHistory.countDocuments();
    const stageTransfers = await LeadHistory.countDocuments({ actionType: 'STAGE_TRANSFERRED' });
    const payments = await LeadHistory.countDocuments({ 
      actionType: { $in: ['PAYMENT_ADDED', 'FINAL_PAYMENT_RECORDED'] } 
    });
    const staffReassignments = await LeadHistory.countDocuments({ 
      actionType: { $in: ['LEAD_ASSIGNED', 'LEAD_SWAPPED'] } 
    });
    const visaVivaActions = await LeadHistory.countDocuments({
      actionType: { 
        $in: [
          'VISA_DATE_ASSIGNED', 
          'VISA_APPLICATION_SUBMITTED', 
          'VISA_STATUS_UPDATED', 
          'VISA_TRACKING_UPDATED', 
          'VIVA_SCHEDULED', 
          'VIVA_RESULT_SUBMITTED',
          'OFFER_LETTER_ISSUED',
          'FLIGHT_JOINING_UPDATED'
        ] 
      }
    });

    res.json({
      success: true,
      count: history.length,
      total: totalCount,
      page: parseInt(page),
      pages: Math.ceil(totalCount / parseInt(limit)),
      stats: {
        totalAllLogs,
        stageTransfers,
        payments,
        staffReassignments,
        visaVivaActions
      },
      data: history
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get complete activity history & audit trail for a specific user / staff member
// @route   GET /api/history/user/:userId
// @access  Private
exports.getUserHistory = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId).select('-password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // 1. Fetch all LeadHistory records performed by this user
    const actions = await LeadHistory.find({ 'performedBy.userId': user._id })
      .populate('lead', 'candidateName leadId passportNumber trade country currentStage')
      .sort({ createdAt: -1 })
      .limit(300)
      .lean();

    // 2. Fetch login history for this user
    const logins = await LoginHistory.find({ user: user._id })
      .sort({ loginTime: -1 })
      .limit(50)
      .lean();

    // 3. Stats & aggregations
    const totalActions = await LeadHistory.countDocuments({ 'performedBy.userId': user._id });
    
    // Unique leads handled
    const uniqueLeads = await LeadHistory.distinct('lead', { 'performedBy.userId': user._id });
    
    // Actions breakdown
    const actionBreakdown = {};
    actions.forEach(a => {
      actionBreakdown[a.actionType] = (actionBreakdown[a.actionType] || 0) + 1;
    });

    res.json({
      success: true,
      data: {
        user,
        summary: {
          totalActions,
          uniqueLeadsCount: uniqueLeads.length,
          totalLogins: logins.length,
          lastActive: actions[0]?.createdAt || logins[0]?.loginTime || user.updatedAt,
          actionBreakdown
        },
        actions,
        logins
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
