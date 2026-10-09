const mongoose = require('mongoose');
const uri = 'mongodb+srv://devdigicoders_db_user:XV0FPU2pOz6fKrKz@cluster0.pcfcnfa.mongodb.net/international_chaya_crm?retryWrites=true&w=majority';

async function check() {
  await mongoose.connect(uri);
  const l1010 = await mongoose.connection.collection('leads').findOne({ leadId: 'LEAD-1010' });
  const l1021 = await mongoose.connection.collection('leads').findOne({ leadId: 'LEAD-1021' });
  
  const h1010 = await mongoose.connection.collection('leadhistories').find({ lead: l1010._id }).toArray();
  const h1021 = await mongoose.connection.collection('leadhistories').find({ lead: l1021._id }).toArray();
  
  console.log('LEAD-1010 history count:', h1010.length);
  console.log('LEAD-1021 history count:', h1021.length);
  
  process.exit(0);
}

check();
