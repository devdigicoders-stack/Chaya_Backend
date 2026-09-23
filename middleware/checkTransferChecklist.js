const ChecklistConfig = require('../models/ChecklistConfig');

const validateTransferChecklist = async (req, res, next) => {
  const { fromStage, toStage, completedChecklist } = req.body;

  if (!fromStage || !toStage) {
    return next(); // Regular update, not a stage transition
  }

  // Find dynamic transfer checklist configured by Admin
  const config = await ChecklistConfig.findOne({ fromStage, toStage });

  if (config && config.checklistItems && config.checklistItems.length > 0) {
    const mandatoryItems = config.checklistItems.filter(item => item.isMandatory);
    const providedChecklist = completedChecklist || [];

    const missingMandatory = [];

    mandatoryItems.forEach(mandatory => {
      const found = providedChecklist.find(
        c => (c.itemKey === mandatory.itemKey || c.label === mandatory.label) && c.isChecked === true
      );
      if (!found) {
        missingMandatory.push(mandatory.label);
      }
    });

    if (missingMandatory.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Transfer failed! Following mandatory tick mark(s) are required to move from '${fromStage}' to '${toStage}':`,
        missingChecklist: missingMandatory
      });
    }
  }

  next();
};

module.exports = validateTransferChecklist;
