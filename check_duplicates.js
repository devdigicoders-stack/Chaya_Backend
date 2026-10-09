const mongoose = require('mongoose');
const uri = 'mongodb+srv://devdigicoders_db_user:XV0FPU2pOz6fKrKz@cluster0.pcfcnfa.mongodb.net/international_chaya_crm?retryWrites=true&w=majority';

async function check() {
  await mongoose.connect(uri);
  const leads = await mongoose.connection.collection('leads').find({}).toArray();
  
  const dupes = leads.filter(l => l.phone === '9876543210' || l.phone === '9833441138');
  console.log('--- Duplicate leads details ---');
  dupes.forEach(l => {
    console.log({
      id: l.leadId,
      name: l.candidateName,
      phone: l.phone,
      stage: l.currentStage,
      passport: l.isPassportHolder,
      hasPassportNumber: !!l.passportNumber,
      notes: l.notes,
      createdAt: l.createdAt
    });
  });
  process.exit(0);
}

check();
