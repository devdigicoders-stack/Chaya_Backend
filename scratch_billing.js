const mongoose = require('mongoose');
require('dotenv').config();
const Lead = require('./models/Lead');

async function test() {
  await mongoose.connect(process.env.MONGO_URI);
  
  const byPhone = await Lead.find({ phone: /9822331138/ }).lean();
  console.log('Found leads matching phone 9822331138:', byPhone.length);
  for (const l of byPhone) {
    console.log('ID:', l._id, 'leadId:', l.leadId, 'name:', l.name, 'phone:', l.phone);
    console.log('billBook:', JSON.stringify(l.billBook, null, 2));
  }

  const all = await Lead.find().select('name phone leadId billBook').lean();
  console.log('Total leads:', all.length);
  for (const l of all) {
    console.log(l.leadId, l.name, l.phone, 'hasBillBook:', !!l.billBook, 'txCount:', l.billBook?.transactions?.length);
  }

  process.exit(0);
}

test().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
