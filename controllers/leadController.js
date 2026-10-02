const mongoose = require('mongoose');
const Lead = require('../models/Lead');
const User = require('../models/User');
const LeadHistory = require('../models/LeadHistory');
const logLeadHistory = require('../utils/historyLogger');

// Generate unique lead ID (e.g. LEAD-1001)
const generateLeadId = async () => {
  const leads = await Lead.find({}, 'leadId').lean();
  let maxId = 1000;
  for (const l of leads) {
    if (l.leadId) {
      const match = l.leadId.match(/LEAD-(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxId) maxId = num;
      }
    }
  }
  let nextId = maxId + 1;
  while (await Lead.exists({ leadId: `LEAD-${nextId}` })) {
    nextId++;
  }
  return `LEAD-${nextId}`;
};

// @desc    Create / Ingest single lead or array of leads
// @access  Allowed Roles: ADMIN, DATA_CONTROLLER, CALLING_STAFF, STAFF_HEAD
// @route   POST /api/leads
exports.createLeads = async (req, res) => {
  try {
    const leadsData = Array.isArray(req.body) ? req.body : [req.body];
    const createdLeads = [];

    for (const item of leadsData) {
      if (!item.candidateName || !item.phone) {
        continue;
      }

      // Check duplicate phone if requested
      const existing = await Lead.findOne({ phone: item.phone.trim() });
      if (existing && req.body.checkDuplicate) {
        return res.status(400).json({
          success: false,
          message: `Candidate with phone ${item.phone} already exists with ID ${existing.leadId}`
        });
      }

      const leadIdStr = await generateLeadId();
      
      const assignedCallingStaff = req.user.role === 'CALLING_STAFF' 
        ? req.user._id 
        : (item.assignedCallingStaff || null);
      const assignedStaffHead = req.user.role === 'CALLING_STAFF' 
        ? (req.user.teamHeadId || null) 
        : (item.assignedStaffHead || null);

      // Normalize isPassportHolder safely
      let isPassportHolder = 'NOT_CONFIRMED';
      if (item.isPassportHolder === true || item.isPassportHolder === 'true' || item.isPassportHolder === 'YES') {
        isPassportHolder = 'YES';
      } else if (item.isPassportHolder === false || item.isPassportHolder === 'false' || item.isPassportHolder === 'NO') {
        isPassportHolder = 'NO';
      } else if (item.passportNumber) {
        isPassportHolder = 'YES';
      }

      // Normalize currentStage safely
      const validStages = [
        'UNASSIGNED', 'CALLING_SCREENING', 'INITIAL_INTERVIEW', 'MEDICAL_PROCESS',
        'FINAL_INTERVIEW', 'ACCOUNTS_COLLECTION', 'STAFF_HEAD_HANDLING',
        'VACANCY_MATCHING', 'PRE_VISA', 'VISA_PROCESSING', 'VIVA_PLACEMENT',
        'CANCELLED', 'REJECTED', 'COMPLETED'
      ];
      let currentStage = item.currentStage;
      if (currentStage === 'INITIAL_INTERVIEW_SCHEDULED') currentStage = 'INITIAL_INTERVIEW';
      if (currentStage === 'MEDICAL_APPOINTMENT_SCHEDULED') currentStage = 'MEDICAL_PROCESS';
      if (!currentStage || !validStages.includes(currentStage)) {
        currentStage = assignedCallingStaff ? 'CALLING_SCREENING' : 'UNASSIGNED';
      }

      const selectionMode = item.selectionMode || 
        (item.routingOption === 'INTERVIEW' ? 'INTERVIEW' : (item.routingOption === 'DIRECT_CV' || item.routingOption === 'CV' ? 'DIRECT_CV' : 'NONE'));

      const lead = await Lead.create({
        leadId: leadIdStr,
        source: item.source ? item.source.toUpperCase().replace(/\s+/g, '_') : 'MANUAL',
        candidateName: item.candidateName.trim(),
        phone: item.phone.trim(),
        email: item.email || '',
        city: item.city || '',
        state: item.state || '',
        trade: item.trade || item.applicationForm?.trade || '',
        notes: item.notes || '',
        passportNumber: item.passportNumber || null,
        isPassportHolder,
        selectionMode,
        assignedStaffHead,
        assignedCallingStaff,
        currentStage,
        applicationForm: {
          trade: item.trade || item.applicationForm?.trade || '',
          experienceYears: item.experienceYears || item.applicationForm?.experienceYears || '',
          preferredCountries: item.preferredCountries || (item.country ? [item.country] : []),
          expectedSalary: item.expectedSalary || item.applicationForm?.expectedSalary || '',
          fatherName: item.fatherName || item.applicationForm?.fatherName || '',
          dob: item.dob || item.applicationForm?.dob || '',
          gender: item.gender || item.applicationForm?.gender || 'Male',
          altPhone: item.altPhone || item.applicationForm?.altPhone || '',
          address: item.address || item.applicationForm?.address || '',
          city: item.city || item.applicationForm?.city || '',
          state: item.state || item.applicationForm?.state || '',
          passportIssueDate: item.passportIssueDate || '',
          passportExpiry: item.passportExpiry || '',
          hasPreviousGCC: item.hasPreviousGCC || 'No',
          previousCountry: item.previousCountry || ''
        }
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

    res.status(201).json({
      success: true,
      message: `Successfully created ${createdLeads.length} lead(s)`,
      count: createdLeads.length,
      data: createdLeads.length === 1 ? createdLeads[0] : createdLeads
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Bulk Import Leads with Duplicate Validation (Excel / WhatsApp / FB)
// @route   POST /api/leads/bulk-import
// @access  Private (Admin, Data Controller, Staff Head)
exports.bulkImportLeads = async (req, res) => {
  try {
    const { leads, source, skipDuplicates = true } = req.body;

    if (!leads || !Array.isArray(leads) || leads.length === 0) {
      return res.status(400).json({ success: false, message: 'Please provide an array of leads to import' });
    }

    let importedCount = 0;
    let duplicateCount = 0;
    const importedLeads = [];
    const duplicates = [];

    for (const item of leads) {
      if (!item.candidateName || !item.phone) {
        continue;
      }

      const phoneClean = String(item.phone).trim();
      const existing = await Lead.findOne({ phone: phoneClean });

      if (existing) {
        duplicateCount++;
        duplicates.push({ name: item.candidateName, phone: phoneClean, existingId: existing.leadId });
        if (skipDuplicates) {
          continue; // Skip duplicate phone
        }
      }

      const leadIdStr = await generateLeadId();
      const isPassportHolder = item.passportNumber 
        ? 'YES' 
        : (item.hasPassport === 'Yes' || item.hasPassport === 'YES' ? 'YES' : 'NOT_CONFIRMED');

      const lead = await Lead.create({
        leadId: leadIdStr,
        source: source ? source.toUpperCase().replace(/\s+/g, '_') : (item.source || 'EXCEL'),
        candidateName: item.candidateName.trim(),
        phone: phoneClean,
        email: item.email || '',
        city: item.city || item.state || '',
        state: item.state || '',
        trade: item.trade || '',
        passportNumber: item.passportNumber || null,
        isPassportHolder,
        currentStage: 'UNASSIGNED',
        applicationForm: {
          trade: item.trade || '',
          experienceYears: item.experience || item.experienceYears || '',
          preferredCountries: item.country ? [item.country] : [],
          expectedSalary: item.expectedSalary || '',
          city: item.city || '',
          state: item.state || ''
        }
      });

      await logLeadHistory({
        lead,
        performedBy: req.user,
        actionType: 'LEAD_CREATED',
        toStage: 'UNASSIGNED',
        remarks: `Bulk imported via ${lead.source} by ${req.user.name}`
      });

      importedLeads.push(lead);
      importedCount++;
    }

    res.json({
      success: true,
      message: `Bulk import completed: ${importedCount} imported, ${duplicateCount} duplicates ${skipDuplicates ? 'skipped' : 'found'}`,
      importedCount,
      duplicateCount,
      duplicates,
      data: importedLeads
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get single lead by ID with full history audit trail
// @route   GET /api/leads/:id
// @access  Private
exports.getLeadById = async (req, res) => {
  try {
    const isObjectId = mongoose.Types.ObjectId.isValid(req.params.id);
    const query = isObjectId ? { _id: req.params.id } : { leadId: req.params.id };
    const lead = await Lead.findOne(query)
      .populate('assignedStaffHead', 'name email phone department')
      .populate('assignedCallingStaff', 'name email phone department')
      .populate('assignedInterviewPanel', 'name email phone department')
      .populate('assignedPreVisaManager', 'name email phone department')
      .populate('assignedVisaManager', 'name email phone department');

    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }

    const history = await LeadHistory.find({ lead: lead._id }).sort({ createdAt: -1 });

    res.json({
      success: true,
      data: {
        ...lead.toObject(),
        history
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update single lead information & application form
// @route   PUT /api/leads/:id
// @access  Private
exports.updateLead = async (req, res) => {
  try {
    const isObjectId = mongoose.Types.ObjectId.isValid(req.params.id);
    const query = isObjectId ? { _id: req.params.id } : { leadId: req.params.id };
    const lead = await Lead.findOne(query);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

    const prevData = lead.toObject();

    // Editable basic fields & workflow stage
    const {
      candidateName, phone, email, city, state, trade, notes,
      passportNumber, isPassportHolder, applicationForm,
      currentStage, selectionMode, initialInterview
    } = req.body;

    if (candidateName) lead.candidateName = candidateName;
    if (phone) lead.phone = phone;
    if (email !== undefined) lead.email = email;
    if (city !== undefined) lead.city = city;
    if (state !== undefined) lead.state = state;
    if (trade !== undefined) lead.trade = trade;
    if (notes !== undefined) lead.notes = notes;
    if (passportNumber !== undefined) lead.passportNumber = passportNumber;
    if (isPassportHolder !== undefined) lead.isPassportHolder = isPassportHolder;
    if (currentStage !== undefined) lead.currentStage = currentStage;
    if (selectionMode !== undefined) lead.selectionMode = selectionMode;
    if (initialInterview !== undefined) {
      lead.initialInterview = {
        ...lead.initialInterview,
        ...initialInterview
      };
    }

    if (applicationForm) {
      lead.applicationForm = {
        ...lead.applicationForm,
        ...applicationForm
      };
      if (applicationForm.trade && !lead.trade) {
        lead.trade = applicationForm.trade;
      }
    }

    await lead.save();

    await logLeadHistory({
      lead,
      performedBy: req.user,
      actionType: 'APPLICATION_FORM_FILLED',
      remarks: `Lead details updated by ${req.user.name} (${req.user.role})`,
      changes: { before: prevData, after: lead.toObject() }
    });

    res.json({ success: true, message: 'Lead updated successfully', data: lead });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Delete single lead (Admin Only)
// @route   DELETE /api/leads/:id
// @access  Private (Admin Only)
exports.deleteLead = async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

    await LeadHistory.deleteMany({ lead: lead._id });
    await Lead.findByIdAndDelete(req.params.id);

    res.json({ success: true, message: `Lead ${lead.leadId} deleted successfully` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Toggle Lead Hold Status
// @route   PUT /api/leads/:id/hold
// @access  Private
exports.toggleLeadHold = async (req, res) => {
  try {
    let lead = null;
    if (mongoose.Types.ObjectId.isValid(req.params.id)) {
      lead = await Lead.findById(req.params.id);
    }
    if (!lead) {
      lead = await Lead.findOne({ leadId: req.params.id });
    }
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

    lead.isHold = isHold !== undefined ? isHold : !lead.isHold;
    lead.holdReason = reason || (lead.isHold ? 'Put on hold by user' : '');
    await lead.save();

    await logLeadHistory({
      lead,
      performedBy: req.user,
      actionType: 'HOLD_STATUS_CHANGED',
      remarks: `Lead hold status changed to ${lead.isHold ? 'ON HOLD' : 'ACTIVE'}. Reason: ${lead.holdReason}`
    });

    res.json({ success: true, message: `Lead hold status updated`, data: lead });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Manual Selective Lead Distribution by Staff Head to Calling Staff (No auto equal split)
// @route   POST /api/leads/assign-staff
// @access  Private (Staff Head / Admin)
exports.assignLeadsToCallingStaff = async (req, res) => {
  try {
    const { leadIds, callingStaffId, confirmReassign } = req.body;

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

    const leads = await Lead.find({ _id: { $in: leadIds } }).populate('assignedCallingStaff', 'name email');
    if (!leads.length) {
      return res.status(404).json({ success: false, message: 'No matching leads found' });
    }

    // Check Case A: Already assigned to the EXACT SAME staff member
    const alreadySameStaff = leads.filter(l => 
      l.assignedCallingStaff && l.assignedCallingStaff._id.toString() === callingStaffUser._id.toString()
    );

    if (alreadySameStaff.length === leads.length) {
      return res.status(400).json({
        success: false,
        alreadySame: true,
        message: `Already Assigned: All selected lead(s) are already assigned to ${callingStaffUser.name}. Reassignment to the same officer is not permitted.`
      });
    }

    // Check Case B: Already assigned to ANOTHER staff member (Needs Reassignment confirmation)
    const assignedOtherStaff = leads.filter(l => 
      l.assignedCallingStaff && l.assignedCallingStaff._id.toString() !== callingStaffUser._id.toString()
    );

    if (assignedOtherStaff.length > 0 && !confirmReassign) {
      const sampleNames = assignedOtherStaff
        .slice(0, 3)
        .map(l => `${l.candidateName || l.name || 'Candidate'} (currently with ${l.assignedCallingStaff?.name || 'Staff'})`)
        .join(', ');

      return res.status(409).json({
        success: false,
        requiresConfirmation: true,
        alreadyAssignedCount: assignedOtherStaff.length,
        alreadySameCount: alreadySameStaff.length,
        message: `${assignedOtherStaff.length} lead(s) are already assigned to other staff members (${sampleNames}${assignedOtherStaff.length > 3 ? '...' : ''}). Do you want to reassign them to ${callingStaffUser.name}?`
      });
    }

    const updatedLeads = [];

    for (const lead of leads) {
      // If already assigned to the same staff, skip without error
      if (lead.assignedCallingStaff && lead.assignedCallingStaff._id.toString() === callingStaffUser._id.toString()) {
        continue;
      }

      const prevStage = lead.currentStage;
      const prevStaffName = lead.assignedCallingStaff?.name || null;
      const isReassign = Boolean(lead.assignedCallingStaff);

      lead.assignedCallingStaff = callingStaffUser._id;
      if (req.user.role === 'STAFF_HEAD') {
        lead.assignedStaffHead = req.user._id;
      }
      lead.currentStage = 'CALLING_SCREENING';
      await lead.save();

      await logLeadHistory({
        lead,
        performedBy: req.user,
        actionType: isReassign ? 'LEAD_REASSIGNED' : 'LEAD_ASSIGNED',
        fromStage: prevStage,
        toStage: 'CALLING_SCREENING',
        remarks: isReassign
          ? `Reassigned lead from ${prevStaffName || 'previous staff'} to Calling Staff: ${callingStaffUser.name}`
          : `Assigned lead to Calling Staff: ${callingStaffUser.name}`
      });

      updatedLeads.push(lead);
    }

    res.json({
      success: true,
      message: `Successfully ${assignedOtherStaff.length > 0 ? 'reassigned' : 'assigned'} ${updatedLeads.length} leads to Calling Staff (${callingStaffUser.name})`,
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
    const { fromStage, toStage, completedChecklist, selectionMode, remarks, fileType } = req.body;
    const lead = await Lead.findById(req.params.id);

    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

    // Stage normalization for legacy/mobile client payloads
    let normalizedToStage = toStage;
    if (toStage === 'MEDICAL') normalizedToStage = 'MEDICAL_PROCESS';
    if (toStage === 'INTERVIEW') normalizedToStage = 'INITIAL_INTERVIEW';
    if (toStage === 'VISA') normalizedToStage = 'VISA_PROCESSING';
    if (toStage === 'VIVA') normalizedToStage = 'VIVA_PLACEMENT';

    const prevStage = lead.currentStage;
    lead.currentStage = normalizedToStage;

    if (selectionMode) {
      lead.selectionMode = selectionMode;
    }

    if (fileType) {
      lead.fileType = fileType;
    } else if (normalizedToStage === 'PRE_VISA' && (!lead.fileType || lead.fileType === 'NOT_SET')) {
      lead.fileType = 'DIRECT_FILE'; // Transferred directly to Pre-Viva stage (FRD Section 14)
    }

    await lead.save();

    await logLeadHistory({
      lead,
      performedBy: req.user,
      actionType: 'STAGE_TRANSFERRED',
      fromStage: prevStage,
      toStage: normalizedToStage,
      completedChecklist: completedChecklist || [],
      remarks: remarks || `Transferred stage from ${prevStage} to ${normalizedToStage}${lead.fileType !== 'NOT_SET' ? ` (${lead.fileType})` : ''}`
    });

    res.json({ success: true, message: `Lead transferred to ${normalizedToStage}`, data: lead });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update Location Confirmation (Max 4 Attempts allowed, moves to Pre-Viva when confirmed or CANCELLED)
// @route   PUT /api/leads/:id/location-confirmation
// @access  Private
exports.updateLocationConfirmation = async (req, res) => {
  try {
    const { confirmedLocation, isConfirmed, isCancelled, cancellationReason } = req.body;
    const lead = await Lead.findById(req.params.id);

    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

    // Handle cancellation by candidate (FRD Section 13)
    if (isCancelled) {
      const prevStage = lead.currentStage;
      lead.currentStage = 'CANCELLED';
      await lead.save();

      await logLeadHistory({
        lead,
        performedBy: req.user,
        actionType: 'STAGE_TRANSFERRED',
        fromStage: prevStage,
        toStage: 'CANCELLED',
        remarks: `Candidate cancelled location confirmation. Reason: ${cancellationReason || 'Candidate withdrawn'}`
      });

      return res.json({ success: true, message: 'Lead marked as CANCELLED per candidate request', data: lead });
    }

    if (lead.locationConfirmation.editCount >= 4 && !isConfirmed) {
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

    if (confirmedLocation !== undefined && confirmedLocation !== '') {
      lead.locationConfirmation.confirmedLocation = confirmedLocation;
    }

    if (isConfirmed) {
      lead.locationConfirmation.isConfirmed = true;
      lead.currentStage = 'PRE_VISA';
      lead.fileType = 'MOVE_FILE';

      await logLeadHistory({
        lead,
        performedBy: req.user,
        actionType: 'STAGE_TRANSFERRED',
        fromStage: lead.currentStage,
        toStage: 'PRE_VISA',
        remarks: `Location confirmed as "${lead.locationConfirmation.confirmedLocation}". File forwarded to Pre-Viva Manager as MOVE FILE.`
      });
    } else {
      lead.locationConfirmation.editCount += 1;
      await logLeadHistory({
        lead,
        performedBy: req.user,
        actionType: 'LOCATION_EDITED',
        remarks: `Location change attempt #${lead.locationConfirmation.editCount}: ${lead.locationConfirmation.confirmedLocation || confirmedLocation}`
      });
    }

    await lead.save();

    res.json({
      success: true,
      message: isConfirmed ? 'Location confirmed and forwarded to Pre-Viva Manager' : `Location updated (Attempt #${lead.locationConfirmation.editCount})`,
      data: lead
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get all leads with filtering & Admin Full Access
// @route   GET /api/leads
// @access  Private
exports.getLeads = async (req, res) => {
  try {
    const { stage, status, source, isPassportHolder, isHold, search, callingStaff, medicalDesk, medicalStatus, preVisaDesk, preVivaStatus, visaDesk, visaStatus, placementDesk, placementStatus, cancelledDesk, blacklistedDesk, refundDesk, closureStatus } = req.query;
    const conditions = [];

    // Role-based scoping
    if (req.user.role === 'STAFF_HEAD') {
      const callingStaffUnderHead = await User.find({ teamHeadId: req.user._id }).select('_id');
      let staffIds = callingStaffUnderHead.map(u => u._id);
      if (staffIds.length === 0) {
        const allCalling = await User.find({ role: 'CALLING_STAFF' }).select('_id');
        staffIds = allCalling.map(u => u._id);
      }

      if (stage === 'UNASSIGNED') {
        conditions.push({
          $or: [
            { currentStage: 'UNASSIGNED' },
            { assignedCallingStaff: null }
          ]
        });
      } else if (stage === 'ALL' || req.query.allPool === 'true') {
        // Staff Head full lead pool visibility
      } else if (stage) {
        conditions.push({ currentStage: stage });
      } else {
        // Default Staff Head view: all operational pool leads
      }
    } else if (req.user.role === 'CALLING_STAFF') {
      conditions.push({ assignedCallingStaff: req.user._id });
    } else if (req.user.role === 'INTERVIEW_PANEL') {
      if (stage && stage !== 'ALL') {
        conditions.push({ currentStage: stage });
      } else {
        conditions.push({
          $or: [
            { currentStage: { $in: ['INITIAL_INTERVIEW', 'INITIAL_INTERVIEW_SCHEDULED'] } },
            { selectionMode: 'INTERVIEW' },
            { 'initialInterview.status': { $in: ['PASS', 'FAIL', 'ON_HOLD'] } }
          ]
        });
      }
    } else if (req.user.role === 'MEDICAL_DEPT') {
      conditions.push({
        $or: [
          { currentStage: 'MEDICAL_PROCESS' },
          { 'medicalDetails.status': { $in: ['SCHEDULED', 'FIT', 'UNFIT'] } },
          { selectionMode: 'DIRECT_CV' },
          { 'initialInterview.status': 'PASS' }
        ]
      });
    } else if (req.user.role === 'ACCOUNTS') {
      if (refundDesk === 'true') {
        // Accounts full access to refund desk
      } else {
        conditions.push({
          $or: [
            { currentStage: 'ACCOUNTS_COLLECTION' },
            { 'billBook.isLedgerOpen': true },
            { closureStatus: { $in: ['REFUND_PENDING', 'FINANCIAL_PENDING'] } }
          ]
        });
      }
    } else if (req.user.role === 'PRE_VISA_MANAGER') {
      conditions.push({
        $or: [
          { currentStage: 'PRE_VISA' },
          { fileType: { $in: ['MOVE_FILE', 'DIRECT_FILE'] } },
          { 'locationConfirmation.isConfirmed': true },
          { 'visaDetails.isDateAssigned': true },
          { 'preVivaDetails.documentsVerified': true }
        ]
      });
    } else if (req.user.role === 'VISA_MANAGER') {
      conditions.push({
        $or: [
          { currentStage: 'VISA_PROCESSING' },
          { 'visaDetails.status': { $in: ['READY_TO_APPLY', 'SUBMITTED', 'PROCESSING', 'APPROVED', 'DELAYED', 'REJECTED'] } },
          { 'preVivaDetails.assignedVisaManager': req.user._id },
          { 'preVivaDetails.status': 'READY_FOR_VISA' },
          { 'preVivaDetails.status': 'CLEARED' },
          { 'status': 'ASSIGNED_TO_VISA_MANAGER' }
        ]
      });
    } else if (req.user.role === 'VIVA_MANAGER') {
      conditions.push({ 
        $or: [
          { currentStage: { $in: ['VIVA_PLACEMENT', 'FINAL_INTERVIEW', 'COMPLETED'] } },
          { 'visaDetails.status': 'APPROVED' }
        ]
      });
    }
    // Note: ADMIN and DATA_CONTROLLER have global view across all leads

    // Common query filters
    if (placementDesk === 'true') {
      conditions.push({
        $or: [
          { currentStage: { $in: ['VIVA_PLACEMENT', 'FINAL_INTERVIEW', 'COMPLETED'] } },
          { 'visaDetails.status': 'APPROVED' },
          { 'placementDetails.vivaSchedule.status': { $in: ['SCHEDULED', 'RESCHEDULED', 'COMPLETED'] } },
          { 'placementDetails.vivaResult.status': { $in: ['SELECTED', 'ON_HOLD', 'NOT_SELECTED'] } },
          { 'placementDetails.offerLetter.status': { $in: ['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED'] } },
          { 'placementDetails.deployment.status': { $in: ['PENDING_TICKET', 'FLIGHT_BOOKED', 'DEPARTED', 'JOINED_ON_SITE'] } }
        ]
      });
    } else if (visaDesk === 'true') {
      conditions.push({
        $or: [
          { currentStage: 'VISA_PROCESSING' },
          { 'visaDetails.status': { $in: ['READY_TO_APPLY', 'SUBMITTED', 'PROCESSING', 'APPROVED', 'DELAYED', 'REJECTED'] } },
          { 'visaDetails.applicationNumber': { $exists: true, $ne: '' } },
          { 'preVivaDetails.status': 'CLEARED' },
          { 'visaDetails.isDateAssigned': true }
        ]
      });
    } else if (preVisaDesk === 'true') {
      conditions.push({
        $or: [
          { currentStage: 'PRE_VISA' },
          { fileType: { $in: ['MOVE_FILE', 'DIRECT_FILE'] } },
          { 'locationConfirmation.isConfirmed': true },
          { 'visaDetails.isDateAssigned': true },
          { 'visaDetails.revisionRequest.isPending': true },
          { 'preVivaDetails.documentsVerified': true }
        ]
      });
    } else if (medicalDesk === 'true') {
      conditions.push({
        $or: [
          { currentStage: 'MEDICAL_PROCESS' },
          { 'medicalDetails.status': { $in: ['SCHEDULED', 'FIT', 'UNFIT'] } },
          { selectionMode: 'DIRECT_CV' },
          { 'initialInterview.status': 'PASS' }
        ]
      });
    } else if (cancelledDesk === 'true') {
      conditions.push({
        $or: [
          { currentStage: 'CANCELLED' },
          { 'placementDetails.vivaSchedule.status': 'CANCELLED' },
          { holdReason: { $regex: /cancel/i } }
        ]
      });
    } else if (blacklistedDesk === 'true') {
      conditions.push({
        $or: [
          { currentStage: 'REJECTED' },
          { 'medicalDetails.status': 'UNFIT' },
          { 'initialInterview.status': 'FAIL' },
          { 'placementDetails.vivaResult.status': 'NOT_SELECTED' },
          { isHold: true },
          { holdReason: { $regex: /unfit|blacklist|reject|fake|forged/i } }
        ]
      });
    } else if (refundDesk === 'true') {
      conditions.push({
        $or: [
          { closureStatus: { $in: ['REFUND_PENDING', 'FINANCIAL_PENDING', 'FINAL_CLOSED', 'CLOSED_NO_ADVANCE'] } },
          { 'billBook.approvedRefund': { $gt: 0 } },
          { 'closureDetails.refundPayable': { $gt: 0 } },
          { currentStage: 'CANCELLED' }
        ]
      });
    } else if (stage && stage !== 'ALL' && stage !== 'UNASSIGNED') {
      conditions.push({ currentStage: stage });
    }

    if (closureStatus && closureStatus !== 'ALL') {
      conditions.push({ closureStatus });
    }
    if (status && status !== 'ALL') {
      if (status === 'CANCELLED') {
        conditions.push({
          $or: [
            { currentStage: 'CANCELLED' },
            { holdReason: { $regex: /cancel/i } }
          ]
        });
      } else if (status === 'UNFIT') {
        conditions.push({
          $or: [
            { 'medicalDetails.status': 'UNFIT' },
            { currentStage: 'REJECTED' },
            { holdReason: { $regex: /unfit/i } }
          ]
        });
      } else if (status === 'REJECTED') {
        conditions.push({
          $or: [
            { currentStage: 'REJECTED' },
            { 'initialInterview.status': 'FAIL' },
            { 'placementDetails.vivaResult.status': 'NOT_SELECTED' }
          ]
        });
      }
    }
    if (visaStatus && visaStatus !== 'ALL') {
      conditions.push({ 'visaDetails.status': visaStatus });
    }
    if (preVivaStatus && preVivaStatus !== 'ALL') {
      conditions.push({ 'preVivaDetails.status': preVivaStatus });
    }
    if (medicalStatus && medicalStatus !== 'ALL') {
      conditions.push({ 'medicalDetails.status': medicalStatus });
    }
    if (source && source !== 'ALL') {
      conditions.push({ source: source.toUpperCase() });
    }
    if (isPassportHolder && isPassportHolder !== 'ALL') {
      conditions.push({ isPassportHolder });
    }
    if (isHold !== undefined && isHold !== 'ALL') {
      conditions.push({ isHold: isHold === 'true' });
    }
    if (callingStaff && callingStaff !== 'ALL') {
      if (callingStaff === 'UNASSIGNED') {
        conditions.push({ assignedCallingStaff: null });
      } else {
        conditions.push({ assignedCallingStaff: callingStaff });
      }
    }
    if (search && search.trim()) {
      const s = search.trim();
      conditions.push({
        $or: [
          { candidateName: { $regex: s, $options: 'i' } },
          { phone: { $regex: s, $options: 'i' } },
          { passportNumber: { $regex: s, $options: 'i' } },
          { leadId: { $regex: s, $options: 'i' } },
          { trade: { $regex: s, $options: 'i' } },
          { city: { $regex: s, $options: 'i' } }
        ]
      });
    }

    const query = conditions.length > 0 ? { $and: conditions } : {};

    const leads = await Lead.find(query)
      .populate('assignedStaffHead', 'name email phone department')
      .populate('assignedCallingStaff', 'name email phone department')
      .populate('assignedVisaManager', 'name email phone department')
      .populate('assignedPreVisaManager', 'name email phone department')
      .sort({ createdAt: -1 });

    // Compute quick stats for UI
    const totalLeads = await Lead.countDocuments();
    const inCallingCount = await Lead.countDocuments({ currentStage: 'CALLING_SCREENING' });
    const passportHoldersCount = await Lead.countDocuments({ isPassportHolder: 'YES' });
    const holdCount = await Lead.countDocuments({ isHold: true });
    const unassignedCount = await Lead.countDocuments({ currentStage: 'UNASSIGNED' });
    const cancelledCount = await Lead.countDocuments({
      $or: [
        { currentStage: 'CANCELLED' },
        { holdReason: { $regex: /cancel/i } }
      ]
    });
    const unfitCount = await Lead.countDocuments({
      $or: [
        { currentStage: 'REJECTED' },
        { 'medicalDetails.status': 'UNFIT' },
        { 'initialInterview.status': 'FAIL' },
        { 'placementDetails.vivaResult.status': 'NOT_SELECTED' }
      ]
    });

    res.json({
      success: true,
      count: leads.length,
      stats: {
        total: totalLeads,
        inCalling: inCallingCount,
        passportHolders: passportHoldersCount,
        onHold: holdCount,
        unassigned: unassignedCount,
        cancelled: cancelledCount,
        unfit: unfitCount
      },
      data: leads
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get Lead Dashboard Analytics for Admin & Staff Head
// @route   GET /api/leads/admin/dashboard-summary
// @access  Private (Admin, Data Controller, Staff Head)
exports.getAdminDashboardSummary = async (req, res) => {
  try {
    // Full CRM operations visibility for Admin, Data Controller, and Staff Head (Lead Operations Head)
    let matchFilter = {};

    if (req.query.period && req.query.period !== 'All Time') {
      const p = req.query.period.trim();
      const now = new Date();
      if (p === 'Today') {
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        matchFilter.createdAt = { $gte: start };
      } else if (p === 'This Week') {
        const day = now.getDay();
        const diff = now.getDate() - day + (day === 0 ? -6 : 1);
        const start = new Date(now.getFullYear(), now.getMonth(), diff);
        start.setHours(0, 0, 0, 0);
        matchFilter.createdAt = { $gte: start };
      } else if (p === 'This Month') {
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        matchFilter.createdAt = { $gte: start };
      } else if (p === 'This Quarter') {
        const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
        const start = new Date(now.getFullYear(), quarterMonth, 1);
        matchFilter.createdAt = { $gte: start };
      } else if (p === 'This Year') {
        const start = new Date(now.getFullYear(), 0, 1);
        matchFilter.createdAt = { $gte: start };
      }
    }

    const matchStage = Object.keys(matchFilter).length > 0 ? [{ $match: matchFilter }] : [];
    const totalLeads = await Lead.countDocuments(matchFilter);
    
    const [
      stageSummary,
      passportSummary,
      sourceSummary,
      fileTypeSummary,
      paymentSummary,
      medicalSummary,
      interviewSummary,
      visaSummary,
      vivaSummary,
      holdCount,
      completedCount,
      cancelledCount,
      assignedLeadsCount,
      unassignedLeadsCount,
      contactedLeadsCount,
      postMedicalCount
    ] = await Promise.all([
      Lead.aggregate([...matchStage, { $group: { _id: '$currentStage', count: { $sum: 1 } } }]),
      Lead.aggregate([...matchStage, { $group: { _id: '$isPassportHolder', count: { $sum: 1 } } }]),
      Lead.aggregate([...matchStage, { $group: { _id: '$source', count: { $sum: 1 } } }]),
      Lead.aggregate([...matchStage, { $group: { _id: '$fileType', count: { $sum: 1 } } }]),
      Lead.aggregate([
        ...matchStage,
        {
          $group: {
            _id: null,
            totalServiceFee: { $sum: '$paymentDetails.serviceFee' },
            totalServicePaid: { $sum: '$paymentDetails.servicePaid' },
            totalMedicalFee: { $sum: '$paymentDetails.medicalFee' },
            totalMedicalPaid: { $sum: '$paymentDetails.medicalPaid' },
            totalCollected: { $sum: '$paymentDetails.totalPaid' },
            fullPaid: { $sum: { $cond: [{ $eq: ['$paymentDetails.paymentStatus', 'FULL'] }, 1, 0] } },
            partialPaid: { $sum: { $cond: [{ $eq: ['$paymentDetails.paymentStatus', 'PARTIAL'] }, 1, 0] } },
            unpaid: { $sum: { $cond: [{ $eq: ['$paymentDetails.paymentStatus', 'UNPAID'] }, 1, 0] } }
          }
        }
      ]),
      Lead.aggregate([...matchStage, { $group: { _id: '$medicalDetails.status', count: { $sum: 1 } } }]),
      Lead.aggregate([...matchStage, { $group: { _id: '$initialInterview.status', count: { $sum: 1 } } }]),
      Lead.aggregate([...matchStage, { $group: { _id: '$visaDetails.status', count: { $sum: 1 } } }]),
      Lead.aggregate([...matchStage, { $group: { _id: '$placementDetails.vivaResult.status', count: { $sum: 1 } } }]),
      Lead.countDocuments({ ...matchFilter, isHold: true }),
      Lead.countDocuments({ ...matchFilter, currentStage: 'COMPLETED' }),
      Lead.countDocuments({ ...matchFilter, currentStage: 'CANCELLED' }),
      Lead.countDocuments({ ...matchFilter, assignedCallingStaff: { $ne: null }, currentStage: { $ne: 'UNASSIGNED' } }),
      Lead.countDocuments({ ...matchFilter, $or: [{ assignedCallingStaff: null }, { currentStage: 'UNASSIGNED' }] }),
      Lead.countDocuments({ ...matchFilter, isPassportHolder: { $in: ['YES', 'NO'] } }),
      Lead.countDocuments({ ...matchFilter, $or: [{ currentStage: 'STAFF_HEAD_HANDLING' }, { 'medicalDetails.status': 'FIT' }] })
    ]);

    const fin = paymentSummary[0] || {};
    const totalRequired = (fin.totalServiceFee || 0) + (fin.totalMedicalFee || 0);
    const totalCollected = fin.totalCollected || 0;
    const totalPending = Math.max(0, totalRequired - totalCollected);

    // Team Calling Performance calculation for Staff Head & Admin
    let teamPerformance = [];
    if (req.user.role === 'STAFF_HEAD' || req.user.role === 'ADMIN') {
      const queryHead = req.user.role === 'STAFF_HEAD' ? { teamHeadId: req.user._id, role: 'CALLING_STAFF' } : { role: 'CALLING_STAFF' };
      let staffList = await User.find(queryHead).select('name email phone avatar department');
      if (staffList.length === 0 && req.user.role === 'STAFF_HEAD') {
        staffList = await User.find({ role: 'CALLING_STAFF' }).select('name email phone avatar department');
      }

      for (const staff of staffList) {
        const assignedCount = await Lead.countDocuments({ assignedCallingStaff: staff._id });
        const contactedCount = await Lead.countDocuments({
          assignedCallingStaff: staff._id,
          isPassportHolder: { $in: ['YES', 'NO'] }
        });
        const pct = assignedCount > 0 ? Math.round((contactedCount / assignedCount) * 100) : 0;
        teamPerformance.push({
          id: staff._id,
          name: staff.name,
          email: staff.email,
          phone: staff.phone,
          avatar: staff.avatar || '',
          assignedCount,
          contactedCount,
          percentage: pct
        });
      }
    }

    res.json({
      success: true,
      data: {
        totalLeads,
        byStage: stageSummary.reduce((acc, curr) => ({ ...acc, [curr._id || 'UNKNOWN']: curr.count }), {}),
        byPassport: passportSummary.reduce((acc, curr) => ({ ...acc, [curr._id || 'UNKNOWN']: curr.count }), {}),
        bySource: sourceSummary.reduce((acc, curr) => ({ ...acc, [curr._id || 'UNKNOWN']: curr.count }), {}),
        byFileType: fileTypeSummary.reduce((acc, curr) => ({ ...acc, [curr._id || 'NOT_SET']: curr.count }), {}),
        medicalSummary: medicalSummary.reduce((acc, curr) => ({ ...acc, [curr._id || 'PENDING']: curr.count }), {}),
        interviewSummary: interviewSummary.reduce((acc, curr) => ({ ...acc, [curr._id || 'PENDING']: curr.count }), {}),
        visaSummary: visaSummary.reduce((acc, curr) => ({ ...acc, [curr._id || 'READY_TO_APPLY']: curr.count }), {}),
        vivaSummary: vivaSummary.reduce((acc, curr) => ({ ...acc, [curr._id || 'PENDING']: curr.count }), {}),
        financials: {
          totalServiceFee: fin.totalServiceFee || 0,
          totalServicePaid: fin.totalServicePaid || 0,
          totalMedicalFee: fin.totalMedicalFee || 0,
          totalMedicalPaid: fin.totalMedicalPaid || 0,
          totalCollected,
          totalPending,
          fullPaidCount: fin.fullPaid || 0,
          partialPaidCount: fin.partialPaid || 0,
          unpaidCount: fin.unpaid || 0
        },
        counts: {
          totalOnHold: holdCount,
          totalCompleted: completedCount,
          totalCancelled: cancelledCount,
          activePipelineCount: Math.max(0, totalLeads - completedCount - cancelledCount),
          assignedLeads: assignedLeadsCount,
          unassignedLeads: unassignedLeadsCount,
          contactedLeads: contactedLeadsCount,
          postMedicalCount
        },
        teamPerformance
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

// @desc    Equal / Round-Robin Lead Distribution across Calling Staff (FRD Section 6)
// @route   POST /api/leads/distribute-round-robin
// @access  Private (Staff Head / Admin)
exports.distributeLeadsRoundRobin = async (req, res) => {
  try {
    const { leadIds, callingStaffIds } = req.body;

    if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
      return res.status(400).json({ success: false, message: 'Please provide leadIds array to distribute' });
    }

    if (!callingStaffIds || !Array.isArray(callingStaffIds) || callingStaffIds.length === 0) {
      return res.status(400).json({ success: false, message: 'Please provide callingStaffIds array for distribution' });
    }

    // Verify all calling staff
    const staffMembers = await User.find({ _id: { $in: callingStaffIds }, role: 'CALLING_STAFF' });
    if (staffMembers.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid Calling Staff members found for distribution' });
    }

    const leads = await Lead.find({ _id: { $in: leadIds } });
    const distributionResult = {};
    staffMembers.forEach(s => { distributionResult[s._id.toString()] = { staff: s, count: 0 }; });

    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i];
      const assignedStaff = staffMembers[i % staffMembers.length];
      const prevStage = lead.currentStage;

      lead.assignedCallingStaff = assignedStaff._id;
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
        remarks: `Round-robin assigned to Calling Staff: ${assignedStaff.name}`
      });

      distributionResult[assignedStaff._id.toString()].count++;
    }

    res.json({
      success: true,
      message: `Successfully distributed ${leads.length} leads equally across ${staffMembers.length} Calling Staff`,
      distribution: Object.values(distributionResult).map(d => ({
        staffId: d.staff._id,
        staffName: d.staff.name,
        assignedCount: d.count
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Swap / Reassign Calling Staff with mandatory audit log (FRD Section 12)
// @route   PUT /api/leads/:id/reassign-staff
// @access  Private (Staff Head / Admin)
exports.reassignLeadCallingStaff = async (req, res) => {
  try {
    const { newCallingStaffId, reason, newStage } = req.body;
    const isObjectId = mongoose.Types.ObjectId.isValid(req.params.id);
    const query = isObjectId ? { _id: req.params.id } : { leadId: req.params.id };
    const lead = await Lead.findOne(query)
      .populate('assignedCallingStaff', 'name email phone');

    if (!lead) return res.status(404).json({ success: false, message: 'Candidate lead not found' });

    if (!newCallingStaffId) {
      return res.status(400).json({ success: false, message: 'Please select new Calling Staff' });
    }

    const newStaff = await User.findById(newCallingStaffId);
    if (!newStaff || newStaff.role !== 'CALLING_STAFF') {
      return res.status(400).json({ success: false, message: 'Invalid Calling Staff selected' });
    }

    const oldStaffName = lead.assignedCallingStaff?.name || 'Unassigned';
    const oldStaffId = lead.assignedCallingStaff?._id || null;
    const prevStage = lead.currentStage;

    lead.assignedCallingStaff = newStaff._id;
    if (req.user.role === 'STAFF_HEAD') {
      lead.assignedStaffHead = req.user._id;
    }
    if (newStage) {
      lead.currentStage = newStage;
    }

    await lead.save();

    await logLeadHistory({
      lead,
      performedBy: req.user,
      actionType: 'LEAD_SWAPPED',
      fromStage: prevStage,
      toStage: lead.currentStage,
      remarks: `Calling Staff swapped from ${oldStaffName} to ${newStaff.name}. Reason: ${reason || 'Staff Head Reassignment'}`,
      changes: {
        previousCallingStaff: { id: oldStaffId, name: oldStaffName },
        newCallingStaff: { id: newStaff._id, name: newStaff.name },
        reason: reason || 'Post-Medical Verification & Allocation'
      }
    });

    res.json({
      success: true,
      message: `Candidate swapped to ${newStaff.name} successfully`,
      data: lead
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Bulk Swap / Reassign Calling Staff with mandatory audit log (FRD Section 12)
// @route   POST /api/leads/bulk-reassign-staff
// @access  Private (Staff Head / Admin)
exports.bulkReassignCallingStaff = async (req, res) => {
  try {
    const { leadIds, newCallingStaffId, reason } = req.body;
    if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
      return res.status(400).json({ success: false, message: 'Please provide leadIds array' });
    }
    if (!newCallingStaffId) {
      return res.status(400).json({ success: false, message: 'Please select new Calling Staff' });
    }

    const newStaff = await User.findById(newCallingStaffId);
    if (!newStaff || newStaff.role !== 'CALLING_STAFF') {
      return res.status(400).json({ success: false, message: 'Invalid Calling Staff selected' });
    }

    const leads = await Lead.find({ _id: { $in: leadIds } }).populate('assignedCallingStaff', 'name email phone');
    const updated = [];

    for (const lead of leads) {
      const oldStaffName = lead.assignedCallingStaff?.name || 'Unassigned';
      const oldStaffId = lead.assignedCallingStaff?._id || null;
      const prevStage = lead.currentStage;

      lead.assignedCallingStaff = newStaff._id;
      if (req.user.role === 'STAFF_HEAD') {
        lead.assignedStaffHead = req.user._id;
      }
      await lead.save();

      await logLeadHistory({
        lead,
        performedBy: req.user,
        actionType: 'LEAD_SWAPPED',
        fromStage: prevStage,
        toStage: lead.currentStage,
        remarks: `Bulk Calling Staff swapped from ${oldStaffName} to ${newStaff.name}. Reason: ${reason || 'Staff Head Reassignment'}`,
        changes: {
          previousCallingStaff: { id: oldStaffId, name: oldStaffName },
          newCallingStaff: { id: newStaff._id, name: newStaff.name },
          reason: reason || 'Post-Medical Verification & Allocation'
        }
      });
      updated.push(lead);
    }

    res.json({
      success: true,
      message: `Successfully reassigned ${updated.length} candidate(s) to ${newStaff.name}`,
      count: updated.length,
      data: updated
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Record Interview Result (Initial / Final) per FRD Section 10
// @route   PUT /api/leads/:id/interview-result
// @access  Private (Interview Panel, Admin, Staff Head)
exports.submitInterviewResult = async (req, res) => {
  try {
    const {
      interviewType = 'INITIAL',
      status,
      remarks,
      interviewDate,
      interviewerName,
      technicalScore,
      communicationScore,
      physicalFitness,
      offeredSalary,
      rejectionReason,
    } = req.body;

    let lead;
    if (mongoose.Types.ObjectId.isValid(req.params.id)) {
      lead = await Lead.findById(req.params.id);
    }
    if (!lead) {
      lead = await Lead.findOne({ leadId: req.params.id });
    }

    if (!lead) return res.status(404).json({ success: false, message: 'Candidate lead not found' });

    const prevStage = lead.currentStage;

    if (interviewType === 'INITIAL') {
      lead.initialInterview.status = status; // PASS, FAIL, ON_HOLD
      lead.initialInterview.remarks = remarks || '';
      if (technicalScore !== undefined) lead.initialInterview.technicalScore = technicalScore;
      if (communicationScore !== undefined) lead.initialInterview.communicationScore = communicationScore;
      if (physicalFitness) lead.initialInterview.physicalFitness = physicalFitness;
      if (offeredSalary) lead.initialInterview.offeredSalary = offeredSalary;
      if (rejectionReason) lead.initialInterview.rejectionReason = rejectionReason;
      if (interviewerName) lead.initialInterview.interviewerName = interviewerName;
      lead.initialInterview.updatedAt = new Date();

      if (status === 'PASS') {
        // FRD Section 10: "Only PASS candidates proceed to Medical from the interview route."
        lead.currentStage = 'MEDICAL_PROCESS';
      } else if (status === 'FAIL') {
        // FAIL candidates remain closed/rejected or in a follow-up status
        lead.currentStage = 'REJECTED';
      } else if (status === 'ON_HOLD') {
        lead.currentStage = 'INITIAL_INTERVIEW';
      }

      await lead.save();

      await logLeadHistory({
        lead,
        performedBy: req.user,
        actionType: 'INITIAL_INTERVIEW_RESULT',
        fromStage: prevStage,
        toStage: lead.currentStage,
        remarks: `Initial Interview result: ${status}. Remarks: ${remarks || 'None'}. Evaluated by: ${interviewerName || req.user.name}`
      });

    } else if (interviewType === 'FINAL') {
      lead.finalInterview.status = status; // CONFIRMED or NOT_CONFIRMED
      lead.finalInterview.remarks = remarks || '';
      lead.finalInterview.updatedAt = new Date();

      if (status === 'CONFIRMED') {
        // Moves to Medical/Accounts Collection
        lead.currentStage = 'ACCOUNTS_COLLECTION';
      }

      await lead.save();

      await logLeadHistory({
        lead,
        performedBy: req.user,
        actionType: 'FINAL_INTERVIEW_RESULT',
        fromStage: prevStage,
        toStage: lead.currentStage,
        remarks: `Final Interview result: ${status}. Remarks: ${remarks || 'None'}. Confirmed by: ${interviewerName || req.user.name}`
      });
    }

    res.json({
      success: true,
      message: `Interview result recorded: ${status}`,
      data: lead
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Schedule GAMCA Medical Appointment (FRD Section 11)
// @route   PUT /api/leads/:id/medical-schedule
// @access  Private (Medical Team, Admin, Staff Head, Calling Staff)
exports.scheduleMedicalAppointment = async (req, res) => {
  try {
    const { center, appointmentDate, slipNo, medicalFee, remarks } = req.body;
    const lead = await Lead.findById(req.params.id);

    if (!lead) {
      return res.status(404).json({ success: false, message: 'Candidate lead not found' });
    }

    if (!lead.medicalDetails) {
      lead.medicalDetails = {};
    }

    const assignedCenter = center || lead.medicalDetails.center || 'GAMCA Medical Center';
    const appDate = appointmentDate ? new Date(appointmentDate) : (lead.medicalDetails.appointmentDate || new Date());
    const slip = slipNo || lead.medicalDetails.slipNo || `GCC-${Math.floor(10000 + Math.random() * 90000)}`;
    const fee = medicalFee !== undefined ? Number(medicalFee) : (lead.medicalDetails.medicalFee || 2500);

    lead.medicalDetails.center = assignedCenter;
    lead.medicalDetails.appointmentDate = appDate;
    lead.medicalDetails.slipNo = slip;
    lead.medicalDetails.medicalFee = fee;
    lead.medicalDetails.status = 'SCHEDULED';
    lead.medicalDetails.remarks = remarks || lead.medicalDetails.remarks || '';
    lead.medicalDetails.updatedAt = new Date();

    // Sync to paymentDetails medicalFee if not already set
    if (!lead.paymentDetails) lead.paymentDetails = {};
    if (!lead.paymentDetails.medicalFee || lead.paymentDetails.medicalFee === 0) {
      lead.paymentDetails.medicalFee = fee;
    }

    await lead.save();

    await logLeadHistory({
      lead,
      performedBy: req.user,
      actionType: 'MEDICAL_RESULT',
      fromStage: lead.currentStage,
      toStage: lead.currentStage,
      remarks: `Scheduled GAMCA appointment at ${assignedCenter} on ${appDate.toLocaleDateString()} (Slip: ${slip}, Medical Fee: ₹${fee}). Scheduled by: ${req.user.name}`,
      changes: {
        center: assignedCenter,
        appointmentDate: appDate,
        slipNo: slip,
        medicalFee: fee,
        remarks: remarks || ''
      }
    });

    res.json({
      success: true,
      message: `Medical appointment scheduled for ${lead.candidateName} at ${assignedCenter}`,
      data: lead
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Check-in candidate for Medical Exam (marks SCHEDULED / In Process)
// @route   PUT /api/leads/:id/medical-checkin
// @access  Private (Medical Team, Admin)
exports.checkInMedicalCandidate = async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ success: false, message: 'Candidate lead not found' });

    if (!lead.medicalDetails) lead.medicalDetails = {};
    lead.medicalDetails.status = 'SCHEDULED';
    lead.medicalDetails.appointmentDate = lead.medicalDetails.appointmentDate || new Date();
    lead.medicalDetails.updatedAt = new Date();

    await lead.save();

    await logLeadHistory({
      lead,
      performedBy: req.user,
      actionType: 'MEDICAL_RESULT',
      fromStage: lead.currentStage,
      toStage: lead.currentStage,
      remarks: `Candidate checked in at Medical Desk (marked In Process) by ${req.user.name || 'Medical Officer'}`
    });

    res.json({
      success: true,
      message: `${lead.candidateName} successfully checked in`,
      data: lead
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Save Medical Examination Tests breakdown & remarks
// @route   PUT /api/leads/:id/medical-tests
// @access  Private (Medical Team, Admin)
exports.saveMedicalTests = async (req, res) => {
  try {
    const { tests, remarks } = req.body;
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ success: false, message: 'Candidate lead not found' });

    if (!lead.medicalDetails) lead.medicalDetails = {};
    if (tests && Array.isArray(tests)) {
      lead.medicalDetails.tests = tests;
    }
    if (remarks !== undefined) {
      lead.medicalDetails.remarks = remarks;
    }
    if (lead.medicalDetails.status === 'PENDING') {
      lead.medicalDetails.status = 'SCHEDULED';
    }
    lead.medicalDetails.updatedAt = new Date();

    await lead.save();

    await logLeadHistory({
      lead,
      performedBy: req.user,
      actionType: 'MEDICAL_RESULT',
      fromStage: lead.currentStage,
      toStage: lead.currentStage,
      remarks: `Medical examination tests progress saved (${tests ? tests.length : 0} tests recorded). Doctor remarks: ${remarks || 'In progress'}`
    });

    res.json({
      success: true,
      message: 'Medical examination tests progress saved successfully',
      data: lead
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Submit GAMCA Medical Fitness Result (FIT / UNFIT) per FRD Section 11 & 12
// @route   PUT /api/leads/:id/medical-result
// @access  Private (Medical Team, Admin, Staff Head)
exports.submitMedicalResult = async (req, res) => {
  try {
    const { status, center, slipNo, validity, reportUrl, remarks } = req.body;
    const lead = await Lead.findById(req.params.id);

    if (!lead) {
      return res.status(404).json({ success: false, message: 'Candidate lead not found' });
    }

    if (!['FIT', 'UNFIT', 'PENDING'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid medical status. Must be FIT, UNFIT, or PENDING' });
    }

    const prevStage = lead.currentStage;
    if (!lead.medicalDetails) lead.medicalDetails = {};

    lead.medicalDetails.status = status;
    if (center) lead.medicalDetails.center = center;
    if (slipNo) lead.medicalDetails.slipNo = slipNo;
    lead.medicalDetails.validity = status === 'FIT' ? (validity || '12 Months') : 'None';
    if (reportUrl !== undefined) lead.medicalDetails.reportUrl = reportUrl;
    lead.medicalDetails.remarks = remarks || lead.medicalDetails.remarks || '';
    lead.medicalDetails.updatedAt = new Date();

    // FRD Section 11 & 12 Rule Enforcement:
    if (status === 'FIT') {
      // Step 12: Move back to Staff Head Desk for verification and reassignment to Calling Staff
      lead.currentStage = 'STAFF_HEAD_HANDLING';
      lead.isHold = false;
      lead.holdReason = '';

      await logLeadHistory({
        lead,
        performedBy: req.user,
        actionType: 'MEDICAL_RESULT',
        fromStage: prevStage,
        toStage: 'STAFF_HEAD_HANDLING',
        remarks: `Candidate cleared GAMCA Medical: FIT. Transferred to Staff Head Desk (Step 12) for Calling Staff assignment & Bill Book. Doctor remarks: ${remarks || 'Fit for GCC Employment'}`
      });
    } else if (status === 'UNFIT') {
      // PDF Rule: Medically unfit candidates are quarantined / rejected to prevent fraudulent re-application
      lead.currentStage = 'REJECTED';
      lead.isHold = true;
      lead.holdReason = `GAMCA Medical Unfit: ${remarks || 'Disqualified on medical exam'}`;

      await logLeadHistory({
        lead,
        performedBy: req.user,
        actionType: 'MEDICAL_RESULT',
        fromStage: prevStage,
        toStage: 'REJECTED',
        remarks: `Candidate failed GAMCA Medical: UNFIT. File quarantined to Rejection / Hold Log. Reason: ${remarks || 'Disqualified on clinical test'}`
      });
    } else {
      await logLeadHistory({
        lead,
        performedBy: req.user,
        actionType: 'MEDICAL_RESULT',
        fromStage: prevStage,
        toStage: lead.currentStage,
        remarks: `Medical status updated to ${status}. Remarks: ${remarks || 'Awaiting clinical reports'}`
      });
    }

    await lead.save();

    res.json({
      success: true,
      message: status === 'FIT' 
        ? `Medical FIT confirmed for ${lead.candidateName}. Forwarded to Staff Head Desk (Step 12)!`
        : `Medical UNFIT recorded. File quarantined to Rejection Log.`,
      data: lead
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Record Payment Booking with separate Service Fee & Medical Fee (FRD Section 11 & 21)
// @route   PUT /api/leads/:id/payment-booking
// @access  Private (Medical Team, Accounts, Admin, Staff Head)
exports.recordPaymentBooking = async (req, res) => {
  try {
    const { serviceFee, servicePaid, medicalFee, medicalPaid, paymentMode, receiptNo, remarks } = req.body;
    const lead = await Lead.findById(req.params.id);

    if (!lead) {
      return res.status(404).json({ success: false, message: 'Candidate lead not found' });
    }

    if (!lead.paymentDetails) lead.paymentDetails = {};

    const sFee = serviceFee !== undefined ? Number(serviceFee) : (lead.paymentDetails.serviceFee || 9500);
    const sPaid = servicePaid !== undefined ? Number(servicePaid) : (lead.paymentDetails.servicePaid || 0);
    const mFee = medicalFee !== undefined ? Number(medicalFee) : (lead.paymentDetails.medicalFee || 2500);
    const mPaid = medicalPaid !== undefined ? Number(medicalPaid) : (lead.paymentDetails.medicalPaid || 0);

    const totalCollected = sPaid + mPaid;
    const totalRequired = sFee + mFee;

    lead.paymentDetails.serviceFee = sFee;
    lead.paymentDetails.servicePaid = sPaid;
    lead.paymentDetails.medicalFee = mFee;
    lead.paymentDetails.medicalPaid = mPaid;
    lead.paymentDetails.advancePaid = totalCollected;
    lead.paymentDetails.totalPaid = totalCollected;
    lead.paymentDetails.paymentMode = paymentMode || lead.paymentDetails.paymentMode || 'UPI';
    lead.paymentDetails.receiptNo = receiptNo || lead.paymentDetails.receiptNo || `REC-${Math.floor(10000 + Math.random() * 90000)}`;
    lead.paymentDetails.lastPaymentDate = new Date();

    if (totalCollected >= totalRequired && totalRequired > 0) {
      lead.paymentDetails.paymentStatus = 'FULL';
    } else if (totalCollected > 0) {
      lead.paymentDetails.paymentStatus = 'PARTIAL';
    } else {
      lead.paymentDetails.paymentStatus = 'UNPAID';
    }

    await lead.save();

    await logLeadHistory({
      lead,
      performedBy: req.user,
      actionType: 'PAYMENT_ADDED',
      remarks: `Payment recorded: Service Fee ₹${sPaid}/₹${sFee}, Medical Fee ₹${mPaid}/₹${mFee}. Total Collected: ₹${totalCollected}. Mode: ${lead.paymentDetails.paymentMode}, Receipt #${lead.paymentDetails.receiptNo}. Recorded by ${req.user.name}`
    });

    res.json({
      success: true,
      message: `Payment booking recorded for ${lead.candidateName}. Receipt #${lead.paymentDetails.receiptNo}`,
      data: lead
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Record Final Payment & Complete Settlement (FRD Section 17 & 23)
// @route   PUT /api/leads/:id/final-payment
// @access  Private (Pre-Viva Manager, Accounts, Admin)
exports.recordFinalPayment = async (req, res) => {
  try {
    const { amount, paymentMode, receiptNo, remarks } = req.body;
    let lead = null;
    if (mongoose.Types.ObjectId.isValid(req.params.id)) {
      lead = await Lead.findById(req.params.id);
    }
    if (!lead) {
      lead = await Lead.findOne({ leadId: req.params.id });
    }
    if (!lead) return res.status(404).json({ success: false, message: 'Candidate lead not found' });

    if (!lead.paymentDetails) lead.paymentDetails = {};

    const collected = Number(amount || 0);
    const prevTotal = Number(lead.paymentDetails.totalPaid || lead.paymentDetails.advancePaid || 0);
    const newTotal = prevTotal + collected;
    const sFee = Number(lead.paymentDetails.serviceFee) || 9500;
    const mFee = Number(lead.paymentDetails.medicalFee) || 2500;
    const totalRequired = Number(lead.paymentDetails.totalFee) || (sFee + mFee);
    const remainingBalance = Math.max(0, totalRequired - newTotal);

    lead.paymentDetails.serviceFee = sFee;
    lead.paymentDetails.medicalFee = mFee;
    lead.paymentDetails.totalFee = totalRequired;
    lead.paymentDetails.totalPaid = newTotal;
    lead.paymentDetails.balanceDue = remainingBalance;
    lead.paymentDetails.lastPaymentDate = new Date();
    if (paymentMode) lead.paymentDetails.paymentMode = paymentMode;
    const rNo = receiptNo || `RCP-${Math.floor(10000 + Math.random() * 90000)}`;
    lead.paymentDetails.receiptNo = rNo;

    if (newTotal >= totalRequired && totalRequired > 0) {
      lead.paymentDetails.paymentStatus = 'FULL';
    } else if (newTotal > 0) {
      lead.paymentDetails.paymentStatus = 'PARTIAL';
    }

    if (!Array.isArray(lead.paymentDetails.history)) {
      lead.paymentDetails.history = [];
    }
    lead.paymentDetails.history.push({
      amount: collected,
      paymentMode: paymentMode || 'UPI',
      receiptNo: rNo,
      remarks: remarks || 'Final settlement payment',
      recordedBy: req.user?.name || 'Pre-Viva Manager',
      date: new Date()
    });

    await lead.save();

    await logLeadHistory({
      lead,
      performedBy: req.user,
      actionType: 'FINAL_PAYMENT_RECORDED',
      remarks: `Final balance payment of ₹${collected} recorded (Total Paid: ₹${newTotal}/₹${totalRequired}, Balance: ₹${remainingBalance}). Receipt #${rNo}, Mode: ${paymentMode || 'UPI'}. Recorded by ${req.user.name}`
    });

    res.json({
      success: true,
      message: `Final balance payment of ₹${collected} recorded for ${lead.candidateName}. Total Paid: ₹${newTotal}`,
      data: lead
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Verify Pre-Viva Documents (Passport, Trade Certification, Medical, PCC)
// @route   PUT /api/leads/:id/pre-viva-verify
// @access  Private (Pre-Viva Manager / Admin)
exports.verifyPreVivaDocs = async (req, res) => {
  try {
    const mongoose = require('mongoose');
    let lead = null;
    if (mongoose.Types.ObjectId.isValid(req.params.id)) {
      lead = await Lead.findById(req.params.id);
    }
    if (!lead) {
      lead = await Lead.findOne({ leadId: req.params.id });
    }
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

    lead.preVivaDetails = lead.preVivaDetails || {};
    lead.preVivaDetails.documentsVerified = true;
    lead.preVivaDetails.verifiedAt = new Date();
    lead.preVivaDetails.verifiedBy = req.user._id;
    lead.preVivaDetails.status = 'READY_FOR_VISA';
    if (req.body.remarks) {
      lead.preVivaDetails.remarks = req.body.remarks;
    }
    if (req.body.documents && Array.isArray(req.body.documents)) {
      lead.preVivaDetails.documents = req.body.documents.map(d => ({
        name: d.title || d.name || 'Document',
        title: d.title || d.name || 'Document',
        fileName: d.fileName || null,
        fileUrl: d.fileUrl || null,
        status: (d.status?.toString().toUpperCase() === 'VERIFIED') ? 'VERIFIED' : 'PENDING',
        verifiedAt: new Date(),
        uploadTime: d.uploadTime || null
      }));
      lead.markModified('preVivaDetails');
    }

    await lead.save();

    await logLeadHistory({
      lead,
      performedBy: req.user,
      actionType: 'PRE_VIVA_DOCS_VERIFIED',
      remarks: `Pre-Viva documentation verified by ${req.user.name}. Status: Ready for Visa Allocation. ${req.body.remarks || ''}`
    });

    res.json({
      success: true,
      message: `Documents verified for ${lead.candidateName}. Ready for Visa Manager assignment.`,
      data: lead
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Upload document for a lead (saved in /uploads/documents)
// @route   POST /api/leads/:id/upload-document
// @access  Private
exports.uploadLeadDocument = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const { docTitle, category } = req.body;
    const filePath = `/uploads/documents/${req.file.filename}`;
    const fileSize = `${(req.file.size / (1024 * 1024)).toFixed(2)} MB`;

    const mongoose = require('mongoose');
    let lead = null;
    if (mongoose.Types.ObjectId.isValid(req.params.id)) {
      lead = await Lead.findById(req.params.id);
    }
    if (!lead) {
      lead = await Lead.findOne({ leadId: req.params.id });
    }

    const docItem = {
      name: docTitle || req.file.originalname,
      title: docTitle || req.file.originalname,
      fileName: req.file.originalname,
      fileUrl: filePath,
      fileSize: fileSize,
      category: category || 'Other',
      status: 'VERIFIED',
      uploadedAt: new Date(),
      uploadedBy: req.user ? req.user.name : 'Staff'
    };

    if (lead) {
      lead.preVivaDetails = lead.preVivaDetails || {};
      lead.preVivaDetails.documents = lead.preVivaDetails.documents || [];
      lead.preVivaDetails.documents = lead.preVivaDetails.documents.filter(
        d => (d.name || d.title) !== (docTitle || req.file.originalname)
      );
      lead.preVivaDetails.documents.push(docItem);
      lead.markModified('preVivaDetails');
      await lead.save();

      await logLeadHistory({
        lead,
        performedBy: req.user,
        actionType: 'DOCUMENT_UPLOADED',
        remarks: `Document "${docTitle || req.file.originalname}" uploaded by ${req.user ? req.user.name : 'Staff'}. File: ${req.file.filename}`
      });
    }

    res.json({
      success: true,
      message: 'Document uploaded successfully',
      data: {
        fileUrl: filePath,
        fileName: req.file.filename,
        originalName: req.file.originalname,
        fileSize: fileSize,
        docItem
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Assign Visa Manager & Set Viva Examination Date
// @route   PUT /api/leads/:id/pre-viva-assign
// @access  Private (Pre-Viva Manager / Admin)
exports.assignPreVivaVisa = async (req, res) => {
  try {
    const { vivaDate, visaManagerId, visaManagerName, dispatchToVisa, remarks } = req.body;
    const mongoose = require('mongoose');
    let lead = null;
    if (mongoose.Types.ObjectId.isValid(req.params.id)) {
      lead = await Lead.findById(req.params.id);
    }
    if (!lead) {
      lead = await Lead.findOne({ leadId: req.params.id });
    }
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

    lead.preVivaDetails = lead.preVivaDetails || {};
    lead.preVivaDetails.documentsVerified = true;
    if (vivaDate) {
      lead.preVivaDetails.vivaDate = new Date(vivaDate);
      lead.visaDetails.visaDate = new Date(vivaDate);
      lead.visaDetails.isDateAssigned = true;
    }
    if (visaManagerName) {
      lead.preVivaDetails.visaManagerName = visaManagerName;
    }
    if (visaManagerId && mongoose.Types.ObjectId.isValid(visaManagerId)) {
      lead.assignedVisaManager = visaManagerId;
      lead.preVivaDetails.assignedVisaManager = visaManagerId;
    }
    lead.preVivaDetails.status = 'SCHEDULED';
    if (remarks) {
      lead.preVivaDetails.remarks = remarks;
    }

    const prevStage = lead.currentStage;
    if (dispatchToVisa) {
      lead.currentStage = 'VISA_PROCESSING';
    }

    await lead.save();

    await logLeadHistory({
      lead,
      performedBy: req.user,
      actionType: 'PRE_VIVA_ASSIGNED',
      fromStage: prevStage,
      toStage: lead.currentStage,
      remarks: `Assigned to Visa Manager: ${visaManagerName || 'Assigned Officer'}. Viva Date: ${vivaDate || 'Scheduled'}. Dispatched to Visa Processing: ${dispatchToVisa ? 'YES' : 'NO'}. ${remarks || ''}`
    });

    res.json({
      success: true,
      message: `File assigned to ${visaManagerName || 'Visa Manager'}${dispatchToVisa ? ' and dispatched to Visa Processing' : ''}.`,
      data: lead
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Submit Pre-Viva Candidate Evaluation (Score & Clearance)
// @route   PUT /api/leads/:id/pre-viva-evaluate
// @access  Private (Pre-Viva Manager / Admin)
exports.evaluatePreVivaCandidate = async (req, res) => {
  try {
    const { score, decision, panelMember, remarks } = req.body;
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

    lead.preVivaDetails = lead.preVivaDetails || {};
    lead.preVivaDetails.score = Number(score) || 0;
    lead.preVivaDetails.panelMember = panelMember || req.user.name;
    lead.preVivaDetails.remarks = remarks || '';

    const prevStage = lead.currentStage;

    if (decision === 'CLEARED') {
      lead.preVivaDetails.status = 'CLEARED';
      lead.currentStage = 'VISA_PROCESSING';
    } else if (decision === 'RETEST_HOLD') {
      lead.preVivaDetails.status = 'RETEST_HOLD';
      lead.isHold = true;
      lead.holdReason = `Pre-Viva Retest Required: ${remarks || 'Score below passing benchmark'}`;
    } else {
      lead.preVivaDetails.status = decision || 'PENDING_VERIFICATION';
    }

    await lead.save();

    await logLeadHistory({
      lead,
      performedBy: req.user,
      actionType: 'PRE_VIVA_EVALUATED',
      fromStage: prevStage,
      toStage: lead.currentStage,
      remarks: `Pre-Viva Evaluation: Score ${score}/100, Verdict: ${decision}. Panel: ${panelMember || req.user.name}. ${remarks || ''}`
    });

    res.json({
      success: true,
      message: `Evaluation saved for ${lead.candidateName} (${decision}). Score: ${score}/100.`,
      data: lead
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Confirm Visa Delay / Date Change Request
// @route   PUT /api/leads/:id/pre-viva-delay
// @access  Private (Pre-Viva Manager / Admin)
exports.confirmVisaDelay = async (req, res) => {
  try {
    const { action, newExpectedDate, candidateRemarks, reason } = req.body;
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

    lead.preVivaDetails = lead.preVivaDetails || {};
    lead.preVivaDetails.delayHistory = lead.preVivaDetails.delayHistory || [];

    const attemptNumber = lead.preVivaDetails.delayHistory.length + 1;
    const prevStage = lead.currentStage;

    if (action === 'CANCEL') {
      lead.currentStage = 'CANCELLED';
      lead.isHold = true;
      lead.holdReason = candidateRemarks || 'Candidate refused delay and requested file cancellation';
      
      lead.preVivaDetails.delayHistory.push({
        attempt: attemptNumber,
        delayDate: new Date(),
        reason: reason || 'Candidate cancelled during delay review',
        user: req.user.name,
        confirmedReadyAt: null,
        candidateRemarks: candidateRemarks || 'Cancelled'
      });

      await logLeadHistory({
        lead,
        performedBy: req.user,
        actionType: 'VISA_DELAY_CANCELLED',
        fromStage: prevStage,
        toStage: 'CANCELLED',
        remarks: `Candidate opted to cancel due to visa delay. Reason: ${candidateRemarks || reason || 'Unwilling to wait'}`
      });

      await lead.save();
      return res.json({
        success: true,
        message: `Candidate ${lead.candidateName} has been cancelled per request.`,
        data: lead
      });
    }

    // Otherwise Confirm Ready & Set New Date
    lead.preVivaDetails.delayHistory.push({
      attempt: attemptNumber,
      expectedDate: newExpectedDate ? new Date(newExpectedDate) : new Date(),
      delayDate: new Date(),
      reason: reason || 'Candidate confirmed ready by Pre-Viva Manager',
      user: req.user.name,
      confirmedReadyAt: new Date(),
      candidateRemarks: candidateRemarks || 'Candidate confirmed ready for revised date'
    });

    if (newExpectedDate) {
      lead.visaDetails.visaDate = new Date(newExpectedDate);
      lead.visaDetails.isDateAssigned = true;
      lead.preVivaDetails.vivaDate = new Date(newExpectedDate);
    }

    if (lead.visaDetails.revisionRequest) {
      lead.visaDetails.revisionRequest.isPending = false;
    }

    lead.currentStage = 'VISA_PROCESSING';
    lead.isHold = false;
    lead.holdReason = '';

    await lead.save();

    await logLeadHistory({
      lead,
      performedBy: req.user,
      actionType: 'VISA_DELAY_CONFIRMED',
      fromStage: prevStage,
      toStage: 'VISA_PROCESSING',
      remarks: `Visa Delay resolved: Candidate confirmed ready. New expected date: ${newExpectedDate || 'Updated'}. Remarks: ${candidateRemarks || ''}`
    });

    res.json({
      success: true,
      message: `Delay confirmed for ${lead.candidateName}. Reassigned to Visa Processing with updated date.`,
      data: lead
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Submit / Apply for Overseas Visa (Step 16)
// @route   PUT /api/leads/:id/visa-apply
// @access  Private (Visa Manager / Admin)
exports.applyVisa = async (req, res) => {
  try {
    const { 
      applicationNumber, country, embassy, visaType, fee, 
      appliedOn, expectedDate, remarks 
    } = req.body;
    
    const isValidId = mongoose.Types.ObjectId.isValid(req.params.id);
    let lead = isValidId ? await Lead.findById(req.params.id) : null;
    if (!lead) {
      lead = await Lead.findOne({ leadId: req.params.id });
    }
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

    lead.visaDetails = lead.visaDetails || {};
    lead.visaDetails.applicationNumber = applicationNumber || `VISA-${Math.floor(1000 + Math.random() * 9000)}`;
    lead.visaDetails.country = country || lead.visaDetails.country || lead.locationConfirmation?.confirmedLocation || 'UAE';
    lead.visaDetails.embassy = embassy || `${lead.visaDetails.country} Embassy, Delhi`;
    lead.visaDetails.visaType = visaType || 'Work Permit Visa';
    lead.visaDetails.fee = fee || '₹4,500';
    lead.visaDetails.appliedOn = appliedOn ? new Date(appliedOn) : new Date();
    lead.visaDetails.expectedDate = expectedDate ? new Date(expectedDate) : null;
    lead.visaDetails.status = 'SUBMITTED';
    lead.visaDetails.trackingStage = 1;
    lead.visaDetails.remarks = remarks || '';
    lead.currentStage = 'VISA_PROCESSING';

    lead.visaDetails.trackingHistory = lead.visaDetails.trackingHistory || [];
    lead.visaDetails.trackingHistory.push({
      date: new Date(),
      stage: 1,
      event: `Dossier Lodged at ${lead.visaDetails.embassy}`,
      user: req.user.name
    });

    await lead.save();

    await logLeadHistory({
      lead,
      performedBy: req.user,
      actionType: 'VISA_APPLICATION_SUBMITTED',
      toStage: 'VISA_PROCESSING',
      remarks: `Visa application #${lead.visaDetails.applicationNumber} lodged at ${lead.visaDetails.embassy} for ${lead.visaDetails.country}. Expected ready date: ${expectedDate || 'Pending'}. Fee: ${lead.visaDetails.fee}`
    });

    res.json({
      success: true,
      message: `Visa application #${lead.visaDetails.applicationNumber} submitted for ${lead.candidateName}`,
      data: lead
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update Visa Stamping Status (Approved, Delayed, Rejected, Processing)
// @route   PUT /api/leads/:id/visa-status
// @access  Private (Visa Manager / Admin)
exports.updateVisaStatus = async (req, res) => {
  try {
    const { status, expectedDate, remarks, stampedDate } = req.body;
    const isValidId = mongoose.Types.ObjectId.isValid(req.params.id);
    let lead = isValidId ? await Lead.findById(req.params.id) : null;
    if (!lead) {
      lead = await Lead.findOne({ leadId: req.params.id });
    }
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

    lead.visaDetails = lead.visaDetails || {};
    lead.visaDetails.status = status;
    lead.visaDetails.remarks = remarks || lead.visaDetails.remarks;
    if (expectedDate) {
      lead.visaDetails.expectedDate = new Date(expectedDate);
    }

    lead.visaDetails.trackingHistory = lead.visaDetails.trackingHistory || [];

    if (status === 'APPROVED') {
      lead.visaDetails.trackingStage = 5;
      lead.visaDetails.stampedDate = stampedDate ? new Date(stampedDate) : new Date();
      lead.currentStage = 'VIVA_PLACEMENT'; // Step 17: Moves to Final Client Viva & Placement Desk
      lead.visaDetails.trackingHistory.push({
        date: new Date(),
        stage: 5,
        event: `Visa Approved & Stamped successfully! ${remarks || ''}`,
        user: req.user.name
      });
    } else if (status === 'DELAYED') {
      lead.visaDetails.revisionRequest = {
        isPending: true,
        requestedDate: expectedDate ? new Date(expectedDate) : null,
        reason: remarks || 'Consular delay reported by Visa Desk',
        requestedBy: req.user._id
      };
      lead.visaDetails.trackingHistory.push({
        date: new Date(),
        stage: lead.visaDetails.trackingStage || 2,
        event: `Visa Stamping Delayed: ${remarks || 'Redirected to Pre-Viva Delay Review'}`,
        user: req.user.name
      });
    } else if (status === 'REJECTED') {
      lead.currentStage = 'REJECTED';
      lead.visaDetails.trackingHistory.push({
        date: new Date(),
        stage: lead.visaDetails.trackingStage || 2,
        event: `Visa Application Rejected: ${remarks || 'Consular denial'}`,
        user: req.user.name
      });
    } else {
      lead.visaDetails.trackingHistory.push({
        date: new Date(),
        stage: lead.visaDetails.trackingStage || 2,
        event: `Visa Status updated to ${status}. ${remarks || ''}`,
        user: req.user.name
      });
    }

    await lead.save();

    await logLeadHistory({
      lead,
      performedBy: req.user,
      actionType: 'VISA_STATUS_UPDATED',
      remarks: `Visa status updated to ${status}. ${remarks || ''}`
    });

    res.json({
      success: true,
      message: `Visa status for ${lead.candidateName} updated to "${status}"`,
      data: lead
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Verify Candidate Visa Dossier Documents (Passport, GAMCA, PCC, Trade, Demand, Photos)
// @route   PUT /api/leads/:id/visa-documents
// @access  Private (Visa Manager / Admin)
exports.verifyVisaDocuments = async (req, res) => {
  try {
    const { verifiedDocuments } = req.body;
    const isValidId = mongoose.Types.ObjectId.isValid(req.params.id);
    let lead = isValidId ? await Lead.findById(req.params.id) : null;
    if (!lead) {
      lead = await Lead.findOne({ leadId: req.params.id });
    }
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

    lead.visaDetails = lead.visaDetails || {};
    lead.visaDetails.verifiedDocuments = verifiedDocuments;

    await lead.save();

    await logLeadHistory({
      lead,
      performedBy: req.user,
      actionType: 'VISA_DOCUMENT_VERIFIED',
      remarks: `Visa dossier documents verified by ${req.user.name}`
    });

    res.json({
      success: true,
      message: `Documents verification saved for ${lead.candidateName}`,
      data: lead
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update Visa Consular Tracking Stage & Milestones (Stages 1 - 5)
// @route   PUT /api/leads/:id/visa-tracking
// @access  Private (Visa Manager / Admin)
exports.updateVisaTracking = async (req, res) => {
  try {
    const { stage, event, remarks, isDelayed } = req.body;
    const isValidId = mongoose.Types.ObjectId.isValid(req.params.id);
    let lead = isValidId ? await Lead.findById(req.params.id) : null;
    if (!lead) {
      lead = await Lead.findOne({ leadId: req.params.id });
    }
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

    lead.visaDetails = lead.visaDetails || {};
    if (stage) {
      lead.visaDetails.trackingStage = Number(stage);
    }
    if (remarks) {
      lead.visaDetails.remarks = remarks;
    }

    lead.visaDetails.trackingHistory = lead.visaDetails.trackingHistory || [];
    lead.visaDetails.trackingHistory.push({
      date: new Date(),
      stage: Number(stage) || lead.visaDetails.trackingStage,
      event: event || `Tracking milestone reached: Stage ${stage}`,
      user: req.user.name
    });

    if (Number(stage) === 5) {
      lead.visaDetails.status = 'APPROVED';
      lead.visaDetails.stampedDate = new Date();
      lead.currentStage = 'VIVA_PLACEMENT';
    }

    if (isDelayed) {
      lead.visaDetails.status = 'DELAYED';
      lead.visaDetails.revisionRequest = {
        isPending: true,
        requestedDate: null,
        reason: remarks || 'Delayed in consular tracking',
        requestedBy: req.user._id
      };
    }

    await lead.save();

    await logLeadHistory({
      lead,
      performedBy: req.user,
      actionType: 'VISA_TRACKING_UPDATED',
      remarks: `Visa tracking stage set to Stage ${stage}: ${event || ''}. ${remarks || ''}`
    });

    res.json({
      success: true,
      message: `Tracking updated for ${lead.candidateName} to Stage ${stage}`,
      data: lead
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Schedule Client Final Viva / Interview (FRD Step 17)
// @route   PUT /api/leads/:id/placement-viva-schedule
// @access  Private
exports.schedulePlacementViva = async (req, res) => {
  try {
    const { vivaId, company, country, date, time, mode, panel, room, remarks, status } = req.body;
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ success: false, message: 'Candidate lead not found' });

    if (!lead.placementDetails) lead.placementDetails = {};
    if (!lead.placementDetails.vivaSchedule) lead.placementDetails.vivaSchedule = {};

    const genVivaId = vivaId || lead.placementDetails.vivaSchedule.vivaId || `VIVA-${Math.floor(100 + Math.random() * 900)}`;

    lead.placementDetails.vivaSchedule = {
      vivaId: genVivaId,
      company: company || lead.placementDetails.vivaSchedule.company || '',
      country: country || lead.placementDetails.vivaSchedule.country || '',
      date: date ? new Date(date) : (lead.placementDetails.vivaSchedule.date || new Date()),
      time: time || lead.placementDetails.vivaSchedule.time || '10:00 AM',
      mode: mode || lead.placementDetails.vivaSchedule.mode || 'Foreign Delegate',
      panel: panel || lead.placementDetails.vivaSchedule.panel || '',
      room: room || lead.placementDetails.vivaSchedule.room || 'Interview Hall A',
      status: status || 'SCHEDULED',
      remarks: remarks || '',
      scheduledBy: req.user._id,
      scheduledAt: new Date()
    };

    if (lead.currentStage !== 'COMPLETED') {
      lead.currentStage = 'VIVA_PLACEMENT';
    }

    await lead.save();

    await logLeadHistory({
      lead,
      performedBy: req.user,
      actionType: 'VIVA_SCHEDULED',
      remarks: `Client Viva #${genVivaId} scheduled for ${lead.candidateName} with ${company || 'Client Panel'} on ${date || 'upcoming date'}`
    });

    res.json({
      success: true,
      message: `Client Viva scheduled successfully for ${lead.candidateName}`,
      data: lead
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Submit Final Client Viva Results & Scorecard (FRD Step 17 / 18)
// @route   PUT /api/leads/:id/placement-viva-result
// @access  Private
exports.submitPlacementVivaResult = async (req, res) => {
  try {
    const { resId, score, breakdown, status, remarks, evaluatedBy } = req.body;
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ success: false, message: 'Candidate lead not found' });

    if (!lead.placementDetails) lead.placementDetails = {};
    if (!lead.placementDetails.vivaResult) lead.placementDetails.vivaResult = {};

    const genResId = resId || lead.placementDetails.vivaResult.resId || `RES-${Math.floor(500 + Math.random() * 499)}`;

    lead.placementDetails.vivaResult = {
      resId: genResId,
      score: score !== undefined ? Number(score) : lead.placementDetails.vivaResult.score,
      breakdown: breakdown || lead.placementDetails.vivaResult.breakdown || { skill: 0, theory: 0, safety: 0, comm: 0 },
      status: status || 'SELECTED',
      remarks: remarks || '',
      evaluatedBy: evaluatedBy || req.user.name,
      evaluatedAt: new Date()
    };

    if (lead.placementDetails.vivaSchedule) {
      lead.placementDetails.vivaSchedule.status = 'COMPLETED';
    }

    if (status === 'SELECTED') {
      lead.currentStage = 'VIVA_PLACEMENT';
    } else if (status === 'NOT_SELECTED') {
      lead.placementDetails.vivaResult.status = 'NOT_SELECTED';
    }

    await lead.save();

    await logLeadHistory({
      lead,
      performedBy: req.user,
      actionType: 'VIVA_RESULT_SUBMITTED',
      remarks: `Viva result recorded for ${lead.candidateName}: ${status} (Score: ${score || 'N/A'}). ${remarks || ''}`
    });

    res.json({
      success: true,
      message: `Viva result updated for ${lead.candidateName} as "${status}"`,
      data: lead
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Issue / Update Foreign Offer Letter (FRD Step 18)
// @route   PUT /api/leads/:id/placement-offer-letter
// @access  Private
exports.issuePlacementOfferLetter = async (req, res) => {
  try {
    const {
      offId, company, country, job, basicSalary, allowance, totalSalary,
      food, accommodation, contractYears, issuedOn, expiresOn, status, notes
    } = req.body;
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ success: false, message: 'Candidate lead not found' });

    if (!lead.placementDetails) lead.placementDetails = {};
    if (!lead.placementDetails.offerLetter) lead.placementDetails.offerLetter = {};

    const genOffId = offId || lead.placementDetails.offerLetter.offId || `OFF-${Math.floor(300 + Math.random() * 699)}`;

    lead.placementDetails.offerLetter = {
      offId: genOffId,
      company: company || lead.placementDetails.offerLetter.company || '',
      country: country || lead.placementDetails.offerLetter.country || '',
      job: job || lead.trade || lead.placementDetails.offerLetter.job || '',
      basicSalary: basicSalary || lead.placementDetails.offerLetter.basicSalary || '',
      allowance: allowance || lead.placementDetails.offerLetter.allowance || '',
      totalSalary: totalSalary || lead.placementDetails.offerLetter.totalSalary || '',
      food: food || lead.placementDetails.offerLetter.food || 'Company Provided',
      accommodation: accommodation || lead.placementDetails.offerLetter.accommodation || 'Company Provided',
      contractYears: contractYears || lead.placementDetails.offerLetter.contractYears || '2 Years (Renewable)',
      issuedOn: issuedOn ? new Date(issuedOn) : (lead.placementDetails.offerLetter.issuedOn || new Date()),
      expiresOn: expiresOn ? new Date(expiresOn) : lead.placementDetails.offerLetter.expiresOn,
      status: status || lead.placementDetails.offerLetter.status || 'SENT',
      notes: notes || lead.placementDetails.offerLetter.notes || ''
    };

    await lead.save();

    await logLeadHistory({
      lead,
      performedBy: req.user,
      actionType: status === 'ACCEPTED' ? 'OFFER_LETTER_STATUS_UPDATED' : 'OFFER_LETTER_ISSUED',
      remarks: `Offer Letter #${genOffId} updated for ${lead.candidateName} (Company: ${company || 'Client'}, Status: ${status || 'SENT'})`
    });

    res.json({
      success: true,
      message: `Offer letter updated for ${lead.candidateName}`,
      data: lead
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update Flight Booking & Deployment On-Site Joining (FRD Step 19 / 20)
// @route   PUT /api/leads/:id/placement-deployment
// @access  Private
exports.updatePlacementDeployment = async (req, res) => {
  try {
    const {
      deployId, company, country, airline, flightNumber, pnr, sector,
      departureAirport, arrivalAirport, flightDate, flightTime, joiningDate,
      poeStatus, baggage, pickupOfficer, campLocation, status, notes
    } = req.body;
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ success: false, message: 'Candidate lead not found' });

    if (!lead.placementDetails) lead.placementDetails = {};
    if (!lead.placementDetails.deployment) lead.placementDetails.deployment = {};

    const genDeployId = deployId || lead.placementDetails.deployment.deployId || `DEP-${Math.floor(800 + Math.random() * 199)}`;

    lead.placementDetails.deployment = {
      deployId: genDeployId,
      company: company || lead.placementDetails.deployment.company || '',
      country: country || lead.placementDetails.deployment.country || '',
      airline: airline || lead.placementDetails.deployment.airline || '',
      flightNumber: flightNumber || lead.placementDetails.deployment.flightNumber || '',
      pnr: pnr || lead.placementDetails.deployment.pnr || '',
      sector: sector || lead.placementDetails.deployment.sector || '',
      departureAirport: departureAirport || lead.placementDetails.deployment.departureAirport || '',
      arrivalAirport: arrivalAirport || lead.placementDetails.deployment.arrivalAirport || '',
      flightDate: flightDate ? new Date(flightDate) : lead.placementDetails.deployment.flightDate,
      flightTime: flightTime || lead.placementDetails.deployment.flightTime || '',
      joiningDate: joiningDate ? new Date(joiningDate) : lead.placementDetails.deployment.joiningDate,
      poeStatus: poeStatus || lead.placementDetails.deployment.poeStatus || 'POE Cleared',
      baggage: baggage || lead.placementDetails.deployment.baggage || '30 KG Check-in + 7 KG Cabin',
      pickupOfficer: pickupOfficer || lead.placementDetails.deployment.pickupOfficer || '',
      campLocation: campLocation || lead.placementDetails.deployment.campLocation || '',
      status: status || lead.placementDetails.deployment.status || 'FLIGHT_BOOKED',
      notes: notes || lead.placementDetails.deployment.notes || ''
    };

    if (status === 'JOINED_ON_SITE') {
      lead.currentStage = 'COMPLETED';
    }

    await lead.save();

    await logLeadHistory({
      lead,
      performedBy: req.user,
      actionType: 'FLIGHT_JOINING_UPDATED',
      remarks: `Deployment updated for ${lead.candidateName}: ${status} (PNR: ${pnr || 'N/A'}, Airline: ${airline || 'N/A'})`
    });

    res.json({
      success: true,
      message: `Deployment & flight details saved for ${lead.candidateName}`,
      data: lead
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── 1. TWO-PARTY FILE TRANSFER PROTOCOL (FRD Section 1 & 7) ───────────────────
// @desc    Initiate transfer request to another staff/department
// @route   POST /api/leads/:id/request-transfer
// @access  Private
exports.requestTransfer = async (req, res) => {
  try {
    const { toUserId, toRole, toStage, reason, pendingTasks } = req.body;
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

    if (lead.pendingTransfer?.hasPending) {
      return res.status(400).json({
        success: false,
        message: `Lead already has a pending transfer to ${lead.pendingTransfer.toUserName || lead.pendingTransfer.toRole}. Wait for acceptance or return.`
      });
    }

    let targetUser = null;
    if (toUserId) {
      targetUser = await User.findById(toUserId);
    }

    lead.pendingTransfer = {
      hasPending: true,
      fromUser: req.user._id,
      fromUserName: req.user.name,
      toUser: targetUser ? targetUser._id : null,
      toUserName: targetUser ? targetUser.name : (toRole || 'Department Queue'),
      toRole: toRole || (targetUser ? targetUser.role : ''),
      toStage: toStage || lead.currentStage,
      reason: reason || 'Routine workflow handover',
      pendingTasks: pendingTasks || '',
      requestedAt: new Date(),
      status: 'PENDING',
      returnReason: ''
    };

    await lead.save();

    await logLeadHistory({
      lead,
      performedBy: req.user,
      actionType: 'TRANSFER_REQUESTED',
      remarks: `Transfer requested by ${req.user.name} to ${lead.pendingTransfer.toUserName} (${lead.pendingTransfer.toRole}). Reason: ${reason || 'N/A'}`
    });

    res.json({ success: true, message: `Transfer requested for ${lead.candidateName}`, data: lead });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Accept incoming file transfer (Receiving Confirmation)
// @route   POST /api/leads/:id/accept-transfer
// @access  Private
exports.acceptTransfer = async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

    if (!lead.pendingTransfer?.hasPending) {
      return res.status(400).json({ success: false, message: 'No pending transfer on this lead' });
    }

    const prevHolderName = lead.activeHolder?.name || lead.pendingTransfer.fromUserName || 'Previous Staff';
    const toStage = lead.pendingTransfer.toStage || lead.currentStage;
    const toRole = lead.pendingTransfer.toRole || req.user.role;

    // Update active holder to current user
    lead.activeHolder = {
      user: req.user._id,
      name: req.user.name,
      role: req.user.role,
      assignedAt: new Date()
    };

    // Update stage if specified
    lead.currentStage = toStage;

    // If moving to medical process, auto open bill book ledger
    if (toStage === 'MEDICAL_PROCESS') {
      if (!lead.billBook) lead.billBook = {};
      lead.billBook.isLedgerOpen = true;
      if (!lead.billBook.openedAt) lead.billBook.openedAt = new Date();
    }

    // Role-specific assignment sync
    if (toRole === 'CALLING_STAFF') lead.assignedCallingStaff = req.user._id;
    if (toRole === 'PRE_VISA_MANAGER') lead.assignedPreVisaManager = req.user._id;
    if (toRole === 'VISA_MANAGER') lead.assignedVisaManager = req.user._id;
    if (toRole === 'STAFF_HEAD') lead.assignedStaffHead = req.user._id;

    lead.pendingTransfer.hasPending = false;
    lead.pendingTransfer.status = 'ACCEPTED';

    await lead.save();

    await logLeadHistory({
      lead,
      performedBy: req.user,
      actionType: 'TRANSFER_ACCEPTED',
      remarks: `File accepted by ${req.user.name} (${req.user.role}) from ${prevHolderName}. Stage: ${lead.currentStage}`
    });

    res.json({ success: true, message: `File accepted by ${req.user.name}`, data: lead });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Return/Reject incoming file transfer with reason
// @route   POST /api/leads/:id/return-transfer
// @access  Private
exports.returnTransfer = async (req, res) => {
  try {
    const { reason } = req.body;
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

    if (!lead.pendingTransfer?.hasPending) {
      return res.status(400).json({ success: false, message: 'No pending transfer on this lead' });
    }

    const fromUserName = lead.pendingTransfer.fromUserName;

    lead.pendingTransfer.hasPending = false;
    lead.pendingTransfer.status = 'RETURNED';
    lead.pendingTransfer.returnReason = reason || 'Incomplete tasks or incorrect department';

    await lead.save();

    await logLeadHistory({
      lead,
      performedBy: req.user,
      actionType: 'TRANSFER_RETURNED',
      remarks: `Transfer returned to ${fromUserName} by ${req.user.name}. Reason: ${lead.pendingTransfer.returnReason}`
    });

    res.json({ success: true, message: `Transfer returned to ${fromUserName}`, data: lead });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get Transfer Inbox (Pending incoming transfers)
// @route   GET /api/leads/transfers/inbox
// @access  Private
exports.getTransferInbox = async (req, res) => {
  try {
    const query = {
      'pendingTransfer.hasPending': true,
      $or: [
        { 'pendingTransfer.toUser': req.user._id },
        { 'pendingTransfer.toRole': req.user.role }
      ]
    };

    if (req.user.role === 'ADMIN' || req.user.role === 'STAFF_HEAD') {
      delete query.$or;
    }

    const leads = await Lead.find(query).sort({ 'pendingTransfer.requestedAt': -1 });
    res.json({ success: true, count: leads.length, data: leads });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get Transfer Outbox (Transfers requested by user)
// @route   GET /api/leads/transfers/outbox
// @access  Private
exports.getTransferOutbox = async (req, res) => {
  try {
    const query = {
      'pendingTransfer.hasPending': true,
      'pendingTransfer.fromUser': req.user._id
    };

    if (req.user.role === 'ADMIN') {
      delete query['pendingTransfer.fromUser'];
    }

    const leads = await Lead.find(query).sort({ 'pendingTransfer.requestedAt': -1 });
    res.json({ success: true, count: leads.length, data: leads });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── 2. STEP 8: COMPANY CONFIRMATION & PROPOSAL/AGREEMENT ─────────────────────
// @desc    Update company proposal & agreement confirmation
// @route   PUT /api/leads/:id/company-confirmation
// @access  Private
exports.updateCompanyConfirmation = async (req, res) => {
  try {
    const { status, companyName, positionOffered, terms, agreementPdfUrl, recordingUrl } = req.body;
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

    if (!lead.companyConfirmation) lead.companyConfirmation = {};

    lead.companyConfirmation = {
      status: status || lead.companyConfirmation.status || 'PROPOSAL_SENT',
      companyName: companyName || lead.companyConfirmation.companyName || lead.country || '',
      positionOffered: positionOffered || lead.companyConfirmation.positionOffered || lead.trade || '',
      proposalDate: lead.companyConfirmation.proposalDate || new Date(),
      acceptanceDate: status === 'AGREEMENT_ACCEPTED' ? new Date() : lead.companyConfirmation.acceptanceDate,
      terms: terms || lead.companyConfirmation.terms || '',
      agreementPdfUrl: agreementPdfUrl || lead.companyConfirmation.agreementPdfUrl || '',
      recordingUrl: recordingUrl || lead.companyConfirmation.recordingUrl || '',
      updatedAt: new Date()
    };

    await lead.save();

    await logLeadHistory({
      lead,
      performedBy: req.user,
      actionType: 'COMPANY_CONFIRMATION_UPDATED',
      remarks: `Company proposal/agreement for ${lead.candidateName} updated: ${status || 'PENDING'} (${companyName || 'Company'})`
    });

    res.json({ success: true, message: 'Company confirmation updated', data: lead });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── 3. BILL BOOK & FINANCIAL LEDGER (FRD Section 9) ──────────────────────────
// @desc    Add transaction to Bill Book (Payment or Refund)
// @route   POST /api/leads/:id/billbook/transaction
// @access  Private
exports.addBillBookTransaction = async (req, res) => {
  try {
    const { type, head, amount, paymentMode, referenceNo, remarks, receiptUrl } = req.body;
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

    if (!lead.billBook) lead.billBook = {};
    if (!lead.billBook.isLedgerOpen) {
      lead.billBook.isLedgerOpen = true;
      lead.billBook.openedAt = new Date();
    }
    if (!lead.billBook.transactions) lead.billBook.transactions = [];

    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Amount must be greater than 0' });
    }

    const isRefund = type === 'REFUND';
    const prefix = isRefund ? 'REF' : 'REC';
    const receiptNo = `BB-${prefix}-${Math.floor(100000 + Math.random() * 900000)}`;

    const newTx = {
      receiptNo,
      type: type || 'PAYMENT',
      head: head || (isRefund ? 'REFUND' : 'ADVANCE'),
      amount: numAmount,
      paymentMode: paymentMode || 'UPI',
      referenceNo: referenceNo || '',
      status: req.user.role === 'ACCOUNTS' || req.user.role === 'ADMIN' ? 'VERIFIED' : 'PENDING_VERIFICATION',
      receiptUrl: receiptUrl || '',
      receivedBy: req.user.name,
      verifiedBy: (req.user.role === 'ACCOUNTS' || req.user.role === 'ADMIN') ? req.user.name : '',
      verifiedAt: (req.user.role === 'ACCOUNTS' || req.user.role === 'ADMIN') ? new Date() : null,
      remarks: remarks || '',
      date: new Date()
    };

    lead.billBook.transactions.push(newTx);

    // Update totals
    if (!isRefund) {
      lead.billBook.totalReceived = (lead.billBook.totalReceived || 0) + numAmount;
      lead.billBook.balanceDue = Math.max(0, (lead.billBook.approvedPayable || 0) - lead.billBook.totalReceived);
      lead.paymentDetails.totalPaid = (lead.paymentDetails.totalPaid || 0) + numAmount;
      lead.paymentDetails.balanceDue = Math.max(0, (lead.paymentDetails.totalFee || 0) - lead.paymentDetails.totalPaid);
      if (head === 'ADVANCE') {
        lead.paymentDetails.advancePaid = (lead.paymentDetails.advancePaid || 0) + numAmount;
      }
    } else {
      lead.billBook.refundPaid = (lead.billBook.refundPaid || 0) + numAmount;
      lead.billBook.refundBalance = Math.max(0, (lead.billBook.approvedRefund || 0) - lead.billBook.refundPaid);
      if (lead.billBook.refundBalance === 0 && (lead.billBook.approvedRefund || 0) > 0) {
        lead.closureStatus = 'FINAL_CLOSED';
      } else {
        lead.closureStatus = 'REFUND_PENDING';
      }
    }

    await lead.save();

    await logLeadHistory({
      lead,
      performedBy: req.user,
      actionType: isRefund ? 'REFUND_RECORDED' : 'PAYMENT_RECORDED',
      remarks: `${type || 'PAYMENT'} of ₹${numAmount} logged in Bill Book (${newTx.head}, Receipt: ${receiptNo}). Balance Due: ₹${lead.billBook.balanceDue}`
    });

    res.json({ success: true, message: `${type || 'Payment'} of ₹${numAmount} saved`, data: lead.billBook });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Verify Bill Book transaction by Accounts (FRD Section 9)
// @route   PUT /api/leads/:id/billbook/transaction/:receiptNo/verify
// @access  Private (ACCOUNTS, ADMIN)
exports.verifyBillBookTransaction = async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

    const tx = lead.billBook?.transactions?.find(t => t.receiptNo === req.params.receiptNo);
    if (!tx) return res.status(404).json({ success: false, message: 'Transaction not found' });

    tx.status = 'VERIFIED';
    tx.verifiedBy = req.user.name;
    tx.verifiedAt = new Date();

    await lead.save();

    await logLeadHistory({
      lead,
      performedBy: req.user,
      actionType: 'PAYMENT_VERIFIED',
      remarks: `Receipt #${tx.receiptNo} of ₹${tx.amount} verified by Accounts (${req.user.name})`
    });

    res.json({ success: true, message: `Receipt ${tx.receiptNo} verified`, data: lead.billBook });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Add / Revise Bill Book charge head
// @route   POST /api/leads/:id/billbook/charge
// @access  Private
exports.addBillBookCharge = async (req, res) => {
  try {
    const { head, amount, description } = req.body;
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

    if (!lead.billBook) lead.billBook = {};
    if (!lead.billBook.charges) lead.billBook.charges = [];

    const numAmount = Number(amount);
    lead.billBook.charges.push({
      head: head || 'SERVICE',
      amount: numAmount,
      description: description || '',
      addedAt: new Date()
    });

    // Recalculate approved payable
    lead.billBook.approvedPayable = lead.billBook.charges.reduce((acc, c) => acc + (c.amount || 0), 0);
    lead.billBook.balanceDue = Math.max(0, lead.billBook.approvedPayable - (lead.billBook.totalReceived || 0));

    await lead.save();

    res.json({ success: true, message: `Charge of ₹${numAmount} added to Bill Book`, data: lead.billBook });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── 4. CONFIRMATIONS & RECORDINGS (FRD Section 8) ────────────────────────────
// @desc    Save or update any of the 8 Confirmation PDFs and Audio/Video Recordings
// @route   POST /api/leads/:id/confirmations
// @access  Private
exports.saveConfirmation = async (req, res) => {
  try {
    const { docType, title, status, sharedChannel, pdfUrl, recordingUrl, recordingType, remarks } = req.body;
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

    if (!lead.confirmations) lead.confirmations = [];

    let conf = lead.confirmations.find(c => c.docType === docType);
    if (!conf) {
      conf = {
        docType,
        title: title || docType.replace(/_/g, ' '),
        status: status || 'GENERATED',
        version: 1,
        generatedAt: new Date(),
        sharedAt: status === 'SHARED' ? new Date() : null,
        sharedChannel: sharedChannel || 'WHATSAPP',
        confirmedAt: status === 'CLIENT_CONFIRMED' ? new Date() : null,
        pdfUrl: pdfUrl || '',
        recordingUrl: recordingUrl || '',
        recordingType: recordingType || 'AUDIO',
        remarks: remarks || '',
        handledBy: req.user._id,
        handledByName: req.user.name
      };
      lead.confirmations.push(conf);
    } else {
      conf.status = status || conf.status;
      if (status === 'SHARED' && !conf.sharedAt) conf.sharedAt = new Date();
      if (status === 'CLIENT_CONFIRMED' && !conf.confirmedAt) conf.confirmedAt = new Date();
      if (pdfUrl) conf.pdfUrl = pdfUrl;
      if (recordingUrl) conf.recordingUrl = recordingUrl;
      if (recordingType) conf.recordingType = recordingType;
      if (remarks) conf.remarks = remarks;
      conf.handledBy = req.user._id;
      conf.handledByName = req.user.name;
    }

    await lead.save();

    await logLeadHistory({
      lead,
      performedBy: req.user,
      actionType: 'CONFIRMATION_UPDATED',
      remarks: `${docType.replace(/_/g, ' ')} set to ${status || 'UPDATED'}${recordingUrl ? ' (Recording Attached)' : ''}`
    });

    res.json({ success: true, message: `Confirmation ${docType} updated`, data: lead.confirmations });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── 5. FILE CLOSURE & REFUND SETTLEMENT (FRD Section 5) ──────────────────────
// @desc    Close file (Closed / No Advance or Cancellation with Refund settlement)
// @route   PUT /api/leads/:id/close-file
// @access  Private (ADMIN, STAFF_HEAD, CALLING_STAFF)
exports.closeLeadFile = async (req, res) => {
  try {
    const { closureType, reason, refundPayable } = req.body;
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

    const validTypes = ['CLOSED_NO_ADVANCE', 'REFUND_PENDING', 'FINANCIAL_PENDING', 'FINAL_CLOSED'];
    const chosenType = validTypes.includes(closureType) ? closureType : 'CLOSED_NO_ADVANCE';

    lead.closureStatus = chosenType;
    if (chosenType === 'FINAL_CLOSED' || chosenType === 'CLOSED_NO_ADVANCE') {
      lead.currentStage = 'CANCELLED';
    }

    const numRefund = Number(refundPayable) || 0;
    lead.closureDetails = {
      closedAt: new Date(),
      reason: reason || 'Candidate withdrew or failed advance confirmation',
      closedBy: req.user._id,
      refundPayable: numRefund,
      refundPaid: lead.billBook?.refundPaid || 0,
      refundBalance: Math.max(0, numRefund - (lead.billBook?.refundPaid || 0)),
      settlementDate: chosenType === 'FINAL_CLOSED' ? new Date() : null
    };

    if (numRefund > 0) {
      if (!lead.billBook) lead.billBook = {};
      lead.billBook.approvedRefund = numRefund;
      lead.billBook.refundBalance = Math.max(0, numRefund - (lead.billBook.refundPaid || 0));
    }

    await lead.save();

    await logLeadHistory({
      lead,
      performedBy: req.user,
      actionType: 'FILE_CLOSED',
      remarks: `Lead file closed as ${chosenType}. Reason: ${reason || 'N/A'}${numRefund > 0 ? ` (Refund: ₹${numRefund})` : ''}`
    });

    res.json({ success: true, message: `File closed as ${chosenType}`, data: lead });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Process refund payment payout (FRD Section 5 & 9)
// @route   POST /api/leads/:id/process-refund
// @access  Private (ACCOUNTS, ADMIN, STAFF_HEAD)
exports.processRefundPayout = async (req, res) => {
  try {
    const { amount, paymentMode, referenceNo, remarks, receiptUrl, bankDetails } = req.body;
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Valid refund amount required' });
    }

    if (!lead.billBook) lead.billBook = { transactions: [], approvedRefund: 0, refundPaid: 0, refundBalance: 0 };
    if (!lead.billBook.transactions) lead.billBook.transactions = [];

    const receiptNo = `REF-${Math.floor(100000 + Math.random() * 900000)}`;

    const newTx = {
      receiptNo,
      type: 'REFUND',
      head: 'REFUND',
      amount: numAmount,
      paymentMode: paymentMode || 'BANK_TRANSFER',
      referenceNo: referenceNo || '',
      status: 'VERIFIED',
      receiptUrl: receiptUrl || '',
      receivedBy: req.user.name,
      verifiedBy: req.user.name,
      verifiedAt: new Date(),
      remarks: remarks || 'Refund disbursed to candidate',
      date: new Date()
    };

    lead.billBook.transactions.push(newTx);

    // Update refund totals
    lead.billBook.refundPaid = (lead.billBook.refundPaid || 0) + numAmount;
    const approved = lead.billBook.approvedRefund || lead.closureDetails?.refundPayable || numAmount;
    lead.billBook.approvedRefund = approved;
    lead.billBook.refundBalance = Math.max(0, approved - lead.billBook.refundPaid);

    if (!lead.closureDetails) lead.closureDetails = {};
    lead.closureDetails.refundPaid = lead.billBook.refundPaid;
    lead.closureDetails.refundBalance = lead.billBook.refundBalance;

    if (bankDetails) {
      lead.closureDetails.bankDetails = {
        accountHolderName: bankDetails.accountHolderName || '',
        bankName: bankDetails.bankName || '',
        accountNumber: bankDetails.accountNumber || '',
        ifscCode: bankDetails.ifscCode || '',
        upiId: bankDetails.upiId || ''
      };
    }

    if (lead.billBook.refundBalance === 0) {
      lead.closureStatus = 'FINAL_CLOSED';
      lead.closureDetails.settlementDate = new Date();
    } else {
      lead.closureStatus = 'REFUND_PENDING';
    }

    await lead.save();

    await logLeadHistory({
      lead,
      performedBy: req.user,
      actionType: 'REFUND_DISBURSED',
      remarks: `Refund of ₹${numAmount} paid via ${paymentMode || 'BANK_TRANSFER'} (Ref/UTR: ${referenceNo || 'N/A'}). Remaining Refund Balance: ₹${lead.billBook.refundBalance}. Status: ${lead.closureStatus}`
    });

    res.json({ success: true, message: `Refund of ₹${numAmount} disbursed successfully`, data: lead });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Re-Apply / Move Candidate to New Vacancy / Company (FRD Section 6 & 11)
// @route   POST /api/leads/:id/re-apply
// @access  Private
exports.reapplyCandidate = async (req, res) => {
  try {
    const {
      newCompanyName,
      newCountry,
      newTrade,
      newSalary,
      reasonForMove,
      targetStage = 'STAFF_HEAD_HANDLING',
      advanceAction = 'CARRY_FORWARD',
      advanceCarriedForward = 0,
      newServiceFee,
      remarks = ''
    } = req.body;

    const lead = await Lead.findById(req.params.id);
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Candidate lead not found' });
    }

    // 1. Initialize applications array if not present
    if (!Array.isArray(lead.applications)) {
      lead.applications = [];
    }

    const currentAppId = lead.currentApplicationId || `APP-${String(lead.applications.length + 1).padStart(2, '0')}`;

    // 2. Build snapshot of the application being archived / moved
    const prevCompanyName = lead.companyConfirmation?.companyName || lead.tradeDetails?.targetCompany || '';
    const prevCountry = lead.country || lead.tradeDetails?.targetCountry || '';
    const prevTrade = lead.trade || lead.tradeDetails?.targetTrade || '';
    const prevSalary = lead.applicationForm?.expectedSalary || lead.tradeDetails?.salaryOffered || '';
    const numCarryForward = Number(advanceCarriedForward) || 0;

    const archivedApplication = {
      applicationId: currentAppId,
      appliedAt: lead.createdAt || new Date(),
      closedAt: new Date(),
      status: 'MOVED',
      reasonForMove: reasonForMove || 'Candidate re-applied to new vacancy/employer',
      companyName: prevCompanyName,
      targetCountry: prevCountry,
      trade: prevTrade,
      salaryOffered: prevSalary,
      stageReached: lead.currentStage,
      fileType: lead.fileType || 'FRESH',
      financials: {
        serviceFee: lead.paymentDetails?.serviceFee || 0,
        advancePaid: lead.paymentDetails?.advancePaid || 0,
        totalPaid: lead.paymentDetails?.totalPaid || 0,
        balanceDue: lead.paymentDetails?.balanceDue || 0,
        adjustmentCarriedForward: numCarryForward
      },
      handledBy: (req.user?.name || req.user?.username || 'Staff'),
      confirmationsCount: Array.isArray(lead.confirmations) ? lead.confirmations.length : 0,
      remarks: remarks || `Moved from ${prevCompanyName || 'Old Vacancy'} to ${newCompanyName || 'New Vacancy'}`,
      archivedSnapshot: {
        companyConfirmation: lead.companyConfirmation,
        tradeDetails: lead.tradeDetails,
        visaDetails: lead.visaDetails,
        medicalDetails: lead.medicalDetails,
        paymentDetails: lead.paymentDetails,
        closureDetails: lead.closureDetails,
        closureStatus: lead.closureStatus
      }
    };

    lead.applications.push(archivedApplication);

    // 3. Increment cycle counter and assign new Application ID
    const nextCycleNum = lead.applications.length + 1;
    const newAppId = `APP-${String(nextCycleNum).padStart(2, '0')}`;
    lead.currentApplicationId = newAppId;
    lead.totalApplicationsCount = nextCycleNum;
    lead.isReapply = true;
    lead.fileType = 'MOVE_FILE';

    // 4. Update Candidate Vacancy Details
    if (newCountry) lead.country = newCountry;
    if (newTrade) lead.trade = newTrade;
    if (!lead.companyConfirmation) lead.companyConfirmation = {};
    lead.companyConfirmation = {
      status: 'PENDING',
      companyName: newCompanyName || '',
      positionOffered: newTrade || lead.trade,
      proposalDate: new Date(),
      acceptanceDate: null,
      terms: remarks || ''
    };

    if (newSalary) {
      if (!lead.applicationForm) lead.applicationForm = {};
      lead.applicationForm.expectedSalary = newSalary;
    }

    // 5. Financial Ledger / Bill Book Carry-Forward
    if (!lead.billBook) {
      lead.billBook = { totalPayable: 0, totalReceived: 0, balanceDue: 0, transactions: [], charges: [] };
    }

    if (newServiceFee && Number(newServiceFee) > 0) {
      const numNewFee = Number(newServiceFee);
      if (!lead.paymentDetails) lead.paymentDetails = {};
      lead.paymentDetails.serviceFee = numNewFee;
      lead.paymentDetails.totalFee = numNewFee;
      lead.billBook.totalPayable = numNewFee;
    }

    if (advanceAction === 'CARRY_FORWARD' && numCarryForward > 0) {
      lead.billBook.transactions.push({
        transactionId: `TXN-REAPPLY-${Date.now().toString().slice(-6)}`,
        type: 'STAGE_PAYMENT',
        amount: numCarryForward,
        paymentMode: 'INTERNAL_ADJUSTMENT',
        referenceNo: `REAPPLY-FROM-${currentAppId}`,
        remarks: `Carried forward ₹${numCarryForward} advance from cycle ${currentAppId} to ${newAppId}`,
        receivedBy: req.user?.name || 'Accounts Staff',
        date: new Date(),
        verified: true,
        verifiedBy: req.user?.name || 'Accounts Staff',
        verifiedAt: new Date()
      });

      lead.billBook.balanceDue = Math.max(0, (lead.billBook.totalPayable || 0) - (lead.billBook.totalReceived || 0));
    }

    // 6. Reset workflow stage
    lead.currentStage = targetStage || 'STAFF_HEAD_HANDLING';
    lead.closureStatus = 'ACTIVE';
    lead.isHold = false;
    lead.holdReason = '';

    await lead.save();

    // 7. Audit log in LeadHistory
    await logLeadHistory({
      lead,
      performedBy: req.user,
      actionType: 'RE_APPLY_INITIATED',
      remarks: `Candidate re-applied under ${newAppId}. Target: ${newCompanyName || 'Pending Company'} (${newTrade || lead.trade}, ${newCountry || lead.country}). Previous cycle ${currentAppId} archived. Stage set to ${targetStage}.`
    });

    res.json({
      success: true,
      message: `Candidate successfully re-applied under Application ${newAppId}`,
      data: lead
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get Candidate Applications & Cross-Matched Records (by Phone/Passport)
// @route   GET /api/leads/:id/applications
// @access  Private
exports.getCandidateApplications = async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Candidate lead not found' });
    }

    // Active cycle info
    const currentApp = {
      applicationId: lead.currentApplicationId || 'APP-01',
      appliedAt: lead.createdAt,
      status: lead.closureStatus === 'ACTIVE' || !lead.closureStatus ? 'ACTIVE' : lead.closureStatus,
      companyName: lead.companyConfirmation?.companyName || lead.tradeDetails?.targetCompany || '',
      targetCountry: lead.country || '',
      trade: lead.trade || '',
      salaryOffered: lead.applicationForm?.expectedSalary || '',
      currentStage: lead.currentStage,
      fileType: lead.fileType || 'FRESH',
      isReapply: !!lead.isReapply,
      totalPaid: lead.paymentDetails?.totalPaid || lead.paymentDetails?.advancePaid || 0,
      balanceDue: lead.paymentDetails?.balanceDue || lead.billBook?.balanceDue || 0
    };

    let crossLinkedLeads = [];
    const queryConditions = [];
    if (lead.phone) queryConditions.push({ phone: lead.phone });
    if (lead.passportNumber && lead.passportNumber !== 'N/A') queryConditions.push({ passportNumber: lead.passportNumber });

    if (queryConditions.length > 0) {
      crossLinkedLeads = await Lead.find({
        _id: { $ne: lead._id },
        $or: queryConditions
      }).select('candidateName leadId phone passportNumber country trade currentStage closureStatus createdAt').lean();
    }

    res.json({
      success: true,
      data: {
        candidateName: lead.candidateName,
        leadId: lead.leadId,
        passportNumber: lead.passportNumber,
        phone: lead.phone,
        currentApplicationId: lead.currentApplicationId || 'APP-01',
        totalApplicationsCount: lead.totalApplicationsCount || 1,
        activeApplication: currentApp,
        archivedApplications: Array.isArray(lead.applications) ? lead.applications : [],
        crossLinkedLeads
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};






