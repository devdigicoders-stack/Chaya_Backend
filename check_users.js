require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function main() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/chhaya_crm');
  const users = await User.find({}, 'name email role department').lean();
  console.log('Total users:', users.length);
  users.forEach(u => console.log(`- ${u.name} | ${u.email} | ${u.role}`));
  
  // Check if DATA_CONTROLLER exists
  const dc = await User.findOne({ role: 'DATA_CONTROLLER' });
  if (!dc) {
    console.log('DATA_CONTROLLER not found, creating default data controller user...');
    await User.create({
      name: 'Data Controller Officer',
      email: 'datacontroller@crm.com',
      password: 'password123',
      role: 'DATA_CONTROLLER',
      department: 'Lead Ingestion & Data',
      phone: '9876500000',
      isActive: true
    });
    console.log('Default DATA_CONTROLLER user created: datacontroller@crm.com / password123');
  } else {
    console.log('Found DATA_CONTROLLER:', dc.name, dc.email);
  }
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
