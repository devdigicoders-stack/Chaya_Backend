const mongoose = require('mongoose');
require('dotenv').config();

const dns = require('dns');
try { dns.setDefaultResultOrder('ipv4first'); } catch (e) {}

async function fixLead1016() {
  await mongoose.connect(process.env.MONGO_URI, { family: 4, serverSelectionTimeoutMS: 8000 });
  const Lead = require('./models/Lead');
  const LeadHistory = require('./models/LeadHistory');

  let lead1016 = await Lead.findOne({ leadId: 'LEAD-1016' });
  if (!lead1016) {
    lead1016 = await Lead.create({
      leadId: 'LEAD-1016',
      candidateName: 'Mohammed Imran Khan',
      phone: '+91 98765 43210',
      email: 'imran.khan@gmail.com',
      city: 'Gorakhpur',
      state: 'Uttar Pradesh',
      trade: '6G Pipe Fabricator & Welder',
      passportNumber: 'Z9876543',
      isPassportHolder: 'YES',
      currentStage: 'PRE_VISA',
      source: 'WHATSAPP'
    });
    console.log('Created Lead 1016:', lead1016._id);
  }

  const res = await LeadHistory.updateMany(
    { leadIdStr: 'LEAD-1016' },
    { $set: { lead: lead1016._id } }
  );
  console.log('Updated LeadHistory documents for 1016:', res.modifiedCount);

  // Link any other orphaned histories by leadIdStr
  const nullHistories = await LeadHistory.find({ lead: null });
  console.log('Remaining null lead histories:', nullHistories.length);
  for (const h of nullHistories) {
    const l = await Lead.findOne({ leadId: h.leadIdStr });
    if (l) {
      h.lead = l._id;
      await h.save();
      console.log('Linked', h.leadIdStr);
    }
  }

  console.log('DONE!');
  process.exit(0);
}

fixLead1016().catch(err => {
  console.error(err);
  process.exit(1);
});
