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
    let providedChecklist = completedChecklist || [];

    // Smart fallback: If mobile client didn't supply explicit completedChecklist array,
    // verify whether the candidate lead record already fulfills the requirements in database!
    if (providedChecklist.length === 0 && req.params.id) {
      const Lead = require('../models/Lead');
      const mongoose = require('mongoose');
      let lead = null;
      if (mongoose.Types.ObjectId.isValid(req.params.id)) {
        lead = await Lead.findById(req.params.id);
      }
      if (!lead) {
        lead = await Lead.findOne({ leadId: req.params.id });
      }
      if (lead) {
        if (lead.isPassportHolder === 'YES' || lead.passportNumber) {
          providedChecklist.push({ itemKey: 'passport_mobile_verified', label: 'Passport & Mobile Number Verified', isChecked: true });
        }
        if (lead.isFormFilled || (lead.applicationForm && typeof lead.applicationForm === 'object' && Object.keys(lead.applicationForm).length > 0)) {
          providedChecklist.push({ itemKey: 'form_filled', label: 'Candidate Full Form Filled', isChecked: true });
        }
      }
    }

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
