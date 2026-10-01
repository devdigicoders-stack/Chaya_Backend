const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const Lead = require('../models/Lead');

async function test() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to DB');
  
  const leads = await Lead.find({
    $or: [
      { currentStage: { $in: ['INITIAL_INTERVIEW', 'INITIAL_INTERVIEW_SCHEDULED', 'VIVA_SCHEDULED', 'FINAL_INTERVIEW'] } },
      { selectionMode: 'INTERVIEW' },
      { 'initialInterview.status': { $in: ['PASS', 'FAIL', 'ON_HOLD'] } }
    ]
  }).select('leadId candidateName currentStage selectionMode initialInterview trade country');
  
  console.log('Found', leads.length, 'interview leads:');
  leads.forEach(l => {
    console.log(l.leadId, '|', l.candidateName, '| Stage:', l.currentStage, '| Mode:', l.selectionMode, '| Status:', l.initialInterview?.status, '| Trade:', l.trade, '| Country:', l.country);
  });
  
  process.exit(0);
}
test();
