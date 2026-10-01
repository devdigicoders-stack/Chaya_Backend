const mongoose = require('mongoose');
require('dotenv').config();
const Lead = require('../models/Lead');

async function check() {
  await mongoose.connect(process.env.MONGO_URI);
  const total = await Lead.countDocuments();
  const medicalDesk = await Lead.countDocuments({
    $or: [
      { currentStage: 'MEDICAL_PROCESS' },
      { 'medicalDetails.status': { $in: ['SCHEDULED', 'FIT', 'UNFIT'] } },
      { selectionMode: 'DIRECT_CV' },
      { 'initialInterview.status': 'PASS' }
    ]
  });
  const samples = await Lead.find({
    $or: [
      { currentStage: 'MEDICAL_PROCESS' },
      { 'medicalDetails.status': { $in: ['SCHEDULED', 'FIT', 'UNFIT'] } },
      { selectionMode: 'DIRECT_CV' },
      { 'initialInterview.status': 'PASS' }
    ]
  }).limit(5).select('leadId candidateName phone passportNumber trade currentStage selectionMode initialInterview.status medicalDetails paymentDetails');

  console.log('Total leads in DB:', total, '| Leads in Medical Desk:', medicalDesk);
  console.log('Sample leads:', JSON.stringify(samples, null, 2));
  process.exit(0);
}
check().catch(err => { console.error(err); process.exit(1); });
