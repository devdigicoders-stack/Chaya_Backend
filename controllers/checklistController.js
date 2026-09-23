const ChecklistConfig = require('../models/ChecklistConfig');

// @desc    Get all stage transfer checklist configs
// @route   GET /api/checklists
// @access  Private
exports.getAllChecklists = async (req, res) => {
  try {
    const configs = await ChecklistConfig.find().populate('updatedBy', 'name email');
    res.json({ success: true, count: configs.length, data: configs });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get checklist config for a specific transition
// @route   GET /api/checklists/transition?fromStage=...&toStage=...
// @access  Private
exports.getChecklistForTransition = async (req, res) => {
  try {
    const { fromStage, toStage } = req.query;
    const config = await ChecklistConfig.findOne({ fromStage, toStage });
    res.json({ success: true, data: config || { fromStage, toStage, checklistItems: [] } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Create or update checklist config for a transition (ADMIN ONLY)
// @route   POST /api/checklists
// @access  Private (Admin Only)
exports.saveChecklistConfig = async (req, res) => {
  try {
    const { fromStage, toStage, checklistItems } = req.body;

    let config = await ChecklistConfig.findOne({ fromStage, toStage });

    if (config) {
      config.checklistItems = checklistItems;
      config.updatedBy = req.user._id;
      await config.save();
    } else {
      config = await ChecklistConfig.create({
        fromStage,
        toStage,
        checklistItems,
        updatedBy: req.user._id
      });
    }

    res.status(200).json({ success: true, message: 'Checklist config saved successfully', data: config });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
