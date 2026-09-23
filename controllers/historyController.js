const LeadHistory = require('../models/LeadHistory');
const Lead = require('../models/Lead');

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
