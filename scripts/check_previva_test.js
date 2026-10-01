const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const Lead = require('../models/Lead');

async function test() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB Connected');

    const allCount = await Lead.countDocuments();
    console.log('Total Leads in DB:', allCount);

    const preVivaQuery = {
      $or: [
        { currentStage: 'PRE_VISA' },
        { fileType: { $in: ['MOVE_FILE', 'DIRECT_FILE'] } },
        { 'locationConfirmation.isConfirmed': true },
        { 'visaDetails.isDateAssigned': true },
        { 'visaDetails.revisionRequest.isPending': true },
        { 'preVivaDetails.documentsVerified': true }
      ]
    };
    const preVivaLeads = await Lead.find(preVivaQuery).limit(2);
    console.log('Sample Lead:', JSON.stringify(preVivaLeads[0], null, 2));

    await mongoose.disconnect();
  } catch (err) {
    console.error('Error:', err);
  }
}
test();
