const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

async function updatePasswords() {
  await mongoose.connect(process.env.MONGO_URI);
  const User = require('../models/User');

  const users = await User.find({});
  console.log('Found', users.length, 'users to update');

  for (const u of users) {
    let plainPass = 'password123';
    if (u.role === 'ADMIN') {
      plainPass = 'admin123';
    }
    await User.updateOne({ _id: u._id }, { $set: { password: plainPass } });
    console.log(`Updated user: ${u.name} (${u.email}) => password: ${plainPass}`);
  }
  process.exit(0);
}

updatePasswords().catch(err => {
  console.error(err);
  process.exit(1);
});
