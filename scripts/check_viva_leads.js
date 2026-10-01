const mongoose = require('mongoose');
require('dotenv').config();
const Lead = require('../models/Lead');

async function test() {
  await mongoose.connect(process.env.MONGO_URI);
  const leads = await Lead.find({
    $or: [
      { currentStage: { $in: ['VIVA_PLACEMENT', 'FINAL_INTERVIEW', 'COMPLETED'] } },
      { 'visaDetails.status': 'APPROVED' },
      { 'placementDetails.vivaSchedule.status': { $exists: true } }
    ]
  }).select('leadId candidateName currentStage visaDetails placementDetails');
  console.log('Count of Viva / Placement candidates:', leads.length);
  leads.forEach(l => console.log(l.leadId, l.candidateName, l.currentStage, l.visaDetails?.status, l.placementDetails?.vivaSchedule?.status, l.placementDetails?.vivaResult?.status));
  process.exit(0);
}
test();
