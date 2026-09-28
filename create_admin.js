const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

const dns = require('dns');
try { dns.setDefaultResultOrder('ipv4first'); } catch (e) {}

// Load environment variables from .env
dotenv.config({ path: path.join(__dirname, '.env') });

const User = require('./models/User');

const createOrUpdateAdmin = async () => {
  try {
    console.log('Connecting to MongoDB Atlas...');
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
      family: 4
    });
    console.log('MongoDB Connected successfully!');

    const adminEmail = 'admin@gmail.com';
    const adminPassword = 'admin123';

    let admin = await User.findOne({ email: adminEmail });

    if (admin) {
      console.log(`Admin with email "${adminEmail}" already exists. Updating password and permissions...`);
      admin.password = adminPassword;
      admin.role = 'ADMIN';
      admin.name = admin.name || 'Super Administrator';
      admin.phone = admin.phone || '+91 9876543210';
      admin.department = admin.department || 'System Administration';
      admin.isActive = true;
      await admin.save();
      console.log('✅ Admin updated successfully!');
    } else {
      console.log(`Creating new Admin user "${adminEmail}"...`);
      admin = await User.create({
        name: 'Super Administrator',
        email: adminEmail,
        phone: '+91 9876543210',
        password: adminPassword,
        role: 'ADMIN',
        department: 'System Administration',
        isActive: true
      });
      console.log('✅ Admin created successfully!');
    }

    console.log('\n=======================================');
    console.log('🎉 ADMIN CREDENTIALS READY TO USE:');
    console.log(`   Email   : ${admin.email}`);
    console.log(`   Password: ${adminPassword}`);
    console.log(`   Role    : ${admin.role}`);
    console.log(`   Name    : ${admin.name}`);
    console.log('=======================================\n');

    await mongoose.disconnect();
    console.log('Database disconnected cleanly.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating/updating admin:', error.message);
    process.exit(1);
  }
};

createOrUpdateAdmin();
