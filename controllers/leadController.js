const Lead = require('../models/Lead');
const User = require('../models/User');
const logLeadHistory = require('../utils/historyLogger');

// Generate unique lead ID (LEAD-1001)
const generateLeadId = async () => {
  const count = await Lead.countDocuments();
  return `LEAD-${1000 + count + 1}`;
};

// @desc    Create / Ingest single or bulk leads
// @access  Allowed Roles: ADMIN, DATA_CONTROLLER, CALLING_STAFF, STAFF_HEAD
// @route   POST /api/leads
exports.createLeads = async (req, res) => {
  try {
    const leadsData = Array.isArray(req.body) ? req.body : [req.body];
    const createdLeads = [];

    for (const item of leadsData) {
      const leadIdStr = await generateLeadId();
      
      // If created by Calling Staff directly, assign to self
      const assignedCallingStaff = req.user.role === 'CALLING_STAFF' ? req.user._id : (item.assignedCallingStaff || null);
      const assignedStaffHead = req.user.role === 'CALLING_STAFF' ? (req.user.teamHeadId || null) : (item.assignedStaffHead || null);

      const lead = await Lead.create({
        leadId: leadIdStr,
        source: item.source || 'MANUAL',
        candidateName: item.candidateName,
        phone: item.phone,
        passportNumber: item.passportNumber || null,
        isPassportHolder: item.isPassportHolder || 'NOT_CONFIRMED',
        assignedStaffHead,
        assignedCallingStaff,
        currentStage: assignedCallingStaff ? 'CALLING_SCREENING' : (assignedStaffHead ? 'CALLING_SCREENING' : 'UNASSIGNED')
      });

      await logLeadHistory({
        lead,
        performedBy: req.user,
        actionType: 'LEAD_CREATED',
        toStage: lead.currentStage,
        remarks: `Lead created by ${req.user.name} (${req.user.role}) via source: ${lead.source}`
      });

      createdLeads.push(lead);
    }

    res.status(201).json({ success: true, count: createdLeads.length, data: createdLeads });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Manual Selective Lead Distribution by Staff Head to Calling Staff (No auto equal split)
// @route   POST /api/leads/assign-staff
// @access  Private (Staff Head / Admin)
exports.assignLeadsToCallingStaff = async (req, res) => {
  try {
    const { leadIds, callingStaffId } = req.body;

    if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
      return res.status(400).json({ success: false, message: 'Please provide leadIds array to assign' });
    }

    if (!callingStaffId) {
      return res.status(400).json({ success: false, message: 'Please select a Calling Staff member to assign leads to' });
    }

    const callingStaffUser = await User.findById(callingStaffId);
    if (!callingStaffUser || callingStaffUser.role !== 'CALLING_STAFF') {
      return res.status(400).json({ success: false, message: 'Invalid Calling Staff selected' });
    }

    const leads = await Lead.find({ _id: { $in: leadIds } });
    const updatedLeads = [];

    for (const lead of leads) {
      const prevStage = lead.currentStage;
      lead.assignedCallingStaff = callingStaffUser._id;
      if (req.user.role === 'STAFF_HEAD') {
        lead.assignedStaffHead = req.user._id;
      }
      lead.currentStage = 'CALLING_SCREENING';
      await lead.save();

      await logLeadHistory({
        lead,
        performedBy: req.user,
        actionType: 'LEAD_ASSIGNED',
        fromStage: prevStage,
        toStage: 'CALLING_SCREENING',
        remarks: `Manually assigned lead to Calling Staff: ${callingStaffUser.name}`
      });

      updatedLeads.push(lead);
    }

    res.json({
      success: true,
      message: `Successfully assigned ${updatedLeads.length} leads to Calling Staff (${callingStaffUser.name})`,
      data: updatedLeads
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update lead categorization (Passport / Non-Passport / Not Confirmed)
// @route   PUT /api/leads/:id/categorize
// @access  Private
exports.categorizeLead = async (req, res) => {
  try {
    const { isPassportHolder, phone, passportNumber } = req.body;
    const lead = await Lead.findById(req.params.id);

    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

    if (isPassportHolder === 'YES') {
      if (!phone || !passportNumber) {
        return res.status(400).json({
          success: false,
          message: 'Both Mobile Number and Passport Number are mandatory for Passport Holders!'
        });
      }
      lead.passportNumber = passportNumber;
      lead.phone = phone;
    }

    lead.isPassportHolder = isPassportHolder;
    await lead.save();

    await logLeadHistory({
      lead,
      performedBy: req.user,
      actionType: 'CATEGORIZED',
      remarks: `Updated Passport Status to: ${isPassportHolder}, Passport No: ${passportNumber || 'N/A'}`
    });

    res.json({ success: true, message: 'Lead categorized successfully', data: lead });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Transfer Lead to Next Stage with Checklist Audit Log
// @route   PUT /api/leads/:id/transfer
// @access  Private
exports.transferLeadStage = async (req, res) => {
  try {
    const { fromStage, toStage, completedChecklist, selectionMode, remarks } = req.body;
    const lead = await Lead.findById(req.params.id);

    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

    const prevStage = lead.currentStage;
    lead.currentStage = toStage;

    if (selectionMode) {
      lead.selectionMode = selectionMode;
    }

    await lead.save();

    await logLeadHistory({
      lead,
      performedBy: req.user,
      actionType: 'STAGE_TRANSFERRED',
      fromStage: prevStage,
      toStage: toStage,
      completedChecklist: completedChecklist || [],
      remarks: remarks || `Transferred stage from ${prevStage} to ${toStage}`
    });

    res.json({ success: true, message: `Lead transferred to ${toStage}`, data: lead });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update Location Confirmation (Max 4 Attempts allowed)
// @route   PUT /api/leads/:id/location-confirmation
// @access  Private
exports.updateLocationConfirmation = async (req, res) => {
  try {
    const { confirmedLocation, isConfirmed } = req.body;
    const lead = await Lead.findById(req.params.id);

    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

    if (lead.locationConfirmation.editCount >= 4) {
      lead.currentStage = 'CANCELLED';
      await lead.save();

      await logLeadHistory({
        lead,
        performedBy: req.user,
        actionType: 'STAGE_TRANSFERRED',
        toStage: 'CANCELLED',
        remarks: 'Lead marked CANCELLED because edit attempts exceeded maximum limit of 4'
      });

      return res.status(400).json({
        success: false,
        message: 'Maximum 4 edit attempts reached! Lead has been transferred to Cancelled status.'
      });
    }

    lead.locationConfirmation.confirmedLocation = confirmedLocation;
    lead.locationConfirmation.isConfirmed = isConfirmed;
    lead.locationConfirmation.editCount += 1;

    await lead.save();

    await logLeadHistory({
      lead,
      performedBy: req.user,
      actionType: 'LOCATION_EDITED',
      remarks: `Location edit attempt #${lead.locationConfirmation.editCount}: ${confirmedLocation}, Confirmed: ${isConfirmed}`
    });

    res.json({ success: true, message: 'Location updated', data: lead });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get all leads with filtering & Admin Full Access Analytics
// @route   GET /api/leads
// @access  Private
exports.getLeads = async (req, res) => {
  try {
    const { stage, source, isPassportHolder, isHold, search } = req.query;
    let query = {};

    // ADMIN & DATA CONTROLLER HAVE FULL ACCESS TO ALL LEADS
    if (req.user.role === 'ADMIN' || req.user.role === 'DATA_CONTROLLER') {
      if (stage) query.currentStage = stage;
      if (source) query.source = source;
      if (isPassportHolder) query.isPassportHolder = isPassportHolder;
      if (isHold) query.isHold = isHold === 'true';
    } else if (req.user.role === 'STAFF_HEAD') {
      query.assignedStaffHead = req.user._id;
      if (stage) query.currentStage = stage;
    } else if (req.user.role === 'CALLING_STAFF') {
      query.assignedCallingStaff = req.user._id;
      if (stage) query.currentStage = stage;
    } else if (req.user.role === 'INTERVIEW_PANEL') {
      query.currentStage = 'INITIAL_INTERVIEW';
    } else if (req.user.role === 'MEDICAL_DEPT') {
      query.currentStage = 'MEDICAL_PROCESS';
    } else if (req.user.role === 'ACCOUNTS') {
      query.currentStage = 'ACCOUNTS_COLLECTION';
    } else if (req.user.role === 'PRE_VISA_MANAGER') {
      query.currentStage = 'PRE_VISA';
    } else if (req.user.role === 'VISA_MANAGER') {
      query.currentStage = 'VISA_PROCESSING';
    }

    if (search) {
      query.$or = [
        { candidateName: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { passportNumber: { $regex: search, $options: 'i' } },
        { leadId: { $regex: search, $options: 'i' } }
      ];
    }

    const leads = await Lead.find(query)
      .populate('assignedStaffHead', 'name email phone')
      .populate('assignedCallingStaff', 'name email phone')
      .sort({ createdAt: -1 });

    res.json({ success: true, count: leads.length, data: leads });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get Lead Dashboard Analytics for Admin (Count by Status & Stage)
// @route   GET /api/leads/admin/dashboard-summary
// @access  Private (Admin & Data Controller Only)
exports.getAdminDashboardSummary = async (req, res) => {
  try {
    const totalLeads = await Lead.countDocuments();
    
    const stageSummary = await Lead.aggregate([
      { $group: { _id: '$currentStage', count: { $sum: 1 } } }
    ]);

    const passportSummary = await Lead.aggregate([
      { $group: { _id: '$isPassportHolder', count: { $sum: 1 } } }
    ]);

    const sourceSummary = await Lead.aggregate([
      { $group: { _id: '$source', count: { $sum: 1 } } }
    ]);

    res.json({
      success: true,
      data: {
        totalLeads,
        byStage: stageSummary.reduce((acc, curr) => ({ ...acc, [curr._id]: curr.count }), {}),
        byPassport: passportSummary.reduce((acc, curr) => ({ ...acc, [curr._id]: curr.count }), {}),
        bySource: sourceSummary.reduce((acc, curr) => ({ ...acc, [curr._id]: curr.count }), {})
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Admin Master Override
// @route   PUT /api/leads/:id/admin-override
// @access  Private (Admin Only)
exports.adminLeadOverride = async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

    const prevSnapshot = lead.toObject();

    Object.assign(lead, req.body);
    await lead.save();

    await logLeadHistory({
      lead,
      performedBy: req.user,
      actionType: 'HOLD_STATUS_CHANGED',
      remarks: `Admin master override update executed. ${req.body.adminRemarks || ''}`,
      changes: { before: prevSnapshot, after: lead.toObject() }
    });

    res.json({ success: true, message: 'Admin master override successful', data: lead });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
