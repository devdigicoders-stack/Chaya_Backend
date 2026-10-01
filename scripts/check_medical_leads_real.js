const mongoose = require('mongoose');
require('dotenv').config();
const Lead = require('../models/Lead');

async function check() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const leads = await Lead.find({
      $or: [
        { currentStage: 'MEDICAL_PROCESS' },
        { 'medicalDetails.status': { $in: ['SCHEDULED', 'FIT', 'UNFIT'] } },
        { selectionMode: 'DIRECT_CV' },
        { 'initialInterview.status': 'PASS' }
      ]
    }).select('leadId candidateName currentStage selectionMode initialInterview.status medicalDetails paymentDetails');
    console.log('Total Medical Desk Candidates found:', leads.length);
    leads.forEach(l => {
      console.log(l.leadId, '|', l.candidateName, '| Stage:', l.currentStage, '| SelMode:', l.selectionMode, '| InitStatus:', l.initialInterview?.status, '| MedStatus:', l.medicalDetails?.status, '| Paid:', l.paymentDetails?.totalPaid);
    });
  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}
check();
