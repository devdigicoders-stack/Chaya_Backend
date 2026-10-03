const mongoose = require('mongoose');
require('dotenv').config();
const Lead = require('./models/Lead');

async function check() {
  await mongoose.connect(process.env.MONGO_URI);
  const leads = await Lead.find({
    $or: [
      { phone: { $regex: '9822331138' } },
      { name: { $regex: 'Tariq', $options: 'i' } },
      { 'billBook.transactions': { $exists: true, $not: { $size: 0 } } }
    ]
  }).lean();
  console.log('Found leads:', leads.length);
  for (const l of leads) {
    console.log('--- Lead ---');
    console.log('ID:', l._id);
    console.log('Name:', l.name);
    console.log('Phone:', l.phone);
    console.log('billBook:', JSON.stringify(l.billBook, null, 2));
  }
  process.exit(0);
}
check();
