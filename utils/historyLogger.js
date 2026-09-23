const LeadHistory = require('../models/LeadHistory');

const logLeadHistory = async ({
  lead,
  performedBy,
  actionType,
  fromStage = null,
  toStage = null,
  completedChecklist = [],
  remarks = '',
  changes = {}
}) => {
  try {
    await LeadHistory.create({
      lead: lead._id,
      leadIdStr: lead.leadId,
      performedBy: {
        userId: performedBy._id,
        name: performedBy.name,
        role: performedBy.role
      },
      actionType,
      fromStage,
      toStage,
      completedChecklist,
      remarks,
      changes
    });
  } catch (error) {
    console.error('Error logging lead history:', error);
  }
};

module.exports = logLeadHistory;
