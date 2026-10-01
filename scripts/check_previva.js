const mongoose = require('mongoose');
require('dotenv').config();
const Lead = require('../models/Lead');

async function check() {
  await mongoose.connect(process.env.MONGO_URI);
  const total = await Lead.countDocuments();
  const preVivaLeads = await Lead.find({
    $or: [
      { currentStage: 'PRE_VISA' },
      { fileType: { $in: ['MOVE_FILE', 'DIRECT_FILE'] } },
      { 'locationConfirmation.isConfirmed': true },
      { 'preVivaDetails.documentsVerified': true }
    ]
  }).select('leadId candidateName phone passportNumber trade currentStage fileType locationConfirmation preVivaDetails visaDetails paymentDetails');

  console.log('Total leads:', total, '| Matching Pre-Viva / Pre-Visa:', preVivaLeads.length);
  for (const l of preVivaLeads) {
    console.log(l.leadId, l.candidateName, l.trade, 'stage:', l.currentStage, 'fileType:', l.fileType, 'confirmed:', l.locationConfirmation?.isConfirmed);
  }
  process.exit(0);
}
check().catch(err => { console.error(err); process.exit(1); });
