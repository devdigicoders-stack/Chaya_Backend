const mongoose = require('mongoose');
const dotenv = require('dotenv');
const dns = require('dns');
const path = require('path');

try { dns.setDefaultResultOrder('ipv4first'); } catch (e) {}
dotenv.config({ path: path.join(__dirname, '.env') });

const Lead = require('./models/Lead');
const User = require('./models/User');
const LeadHistory = require('./models/LeadHistory');

const seedLeads = async () => {
  try {
    console.log('Connecting to MongoDB Atlas...');
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
      family: 4
    });
    console.log('Connected to MongoDB successfully!');

    // Find admin user or create fallback
    let admin = await User.findOne({ email: 'admin@gmail.com' });
    if (!admin) {
      admin = await User.create({
        name: 'Super Administrator',
        email: 'admin@gmail.com',
        password: 'admin123',
        role: 'ADMIN',
        department: 'System Administration'
      });
    }

    // Find or create Staff Head
    let staffHead = await User.findOne({ role: 'STAFF_HEAD' });
    if (!staffHead) {
      staffHead = await User.create({
        name: 'Rajiv Sharma (Staff Head)',
        email: 'rajiv.staffhead@crm.com',
        phone: '9876543220',
        password: 'staffhead123',
        role: 'STAFF_HEAD',
        department: 'Sourcing & Operations'
      });
    }

    // Find or create Calling Staff
    let callingStaff1 = await User.findOne({ role: 'CALLING_STAFF' });
    if (!callingStaff1) {
      callingStaff1 = await User.create({
        name: 'Pooja Singh',
        email: 'pooja.calling@crm.com',
        phone: '9876543221',
        password: 'calling123',
        role: 'CALLING_STAFF',
        department: 'Calling Desk',
        teamHeadId: staffHead._id
      });
    }

    let callingStaff2 = await User.findOne({ email: 'amit.calling@crm.com' });
    if (!callingStaff2) {
      callingStaff2 = await User.create({
        name: 'Amit Verma',
        email: 'amit.calling@crm.com',
        phone: '9876543222',
        password: 'calling123',
        role: 'CALLING_STAFF',
        department: 'Calling Desk',
        teamHeadId: staffHead._id
      });
    }

    // Sample initial leads aligned with FRD
    const sampleLeads = [
      {
        leadId: 'LEAD-1001',
        candidateName: 'Rahul Sharma',
        phone: '+91 98765 43210',
        email: 'rahul.welder@gmail.com',
        city: 'Gopalganj',
        state: 'Bihar',
        trade: '6G Pipe Fabricator & Welder',
        source: 'WHATSAPP',
        isPassportHolder: 'YES',
        passportNumber: 'Z8941203',
        currentStage: 'CALLING_SCREENING',
        assignedStaffHead: staffHead._id,
        assignedCallingStaff: callingStaff1._id,
        notes: 'Ex-Oman 6 years experience. All trade credentials available. Ready for bench test.',
        applicationForm: {
          trade: '6G Pipe Fabricator & Welder',
          experienceYears: '6 Years (Ex-Oman)',
          preferredCountries: ['Saudi Arabia', 'UAE'],
          expectedSalary: '2,200 SAR',
          fatherName: 'Ramprasad Sharma',
          city: 'Gopalganj',
          state: 'Bihar',
          gender: 'Male',
          passportExpiry: '2031-11-14'
        }
      },
      {
        leadId: 'LEAD-1002',
        candidateName: 'Mohammad Tariq Ali',
        phone: '+91 87654 32109',
        email: 'tariq.electrician@gmail.com',
        city: 'Gorakhpur',
        state: 'Uttar Pradesh',
        trade: 'Industrial Electrician (HV/LV)',
        source: 'FACEBOOK',
        isPassportHolder: 'YES',
        passportNumber: 'N4512984',
        currentStage: 'INITIAL_INTERVIEW',
        assignedStaffHead: staffHead._id,
        assignedCallingStaff: callingStaff2._id,
        notes: 'Passed calling screening. Scheduled for Dubai client bench interview.',
        selectionMode: 'INTERVIEW',
        applicationForm: {
          trade: 'Industrial Electrician (HV/LV)',
          experienceYears: '4 Years',
          preferredCountries: ['UAE', 'Qatar'],
          expectedSalary: '1,800 AED',
          fatherName: 'Ali Mohammad',
          city: 'Gorakhpur',
          state: 'Uttar Pradesh',
          gender: 'Male'
        }
      },
      {
        leadId: 'LEAD-1003',
        candidateName: 'Sandeep Kumar Yadav',
        phone: '+91 76543 21098',
        email: 'sandeep.driver@gmail.com',
        city: 'Siwan',
        state: 'Bihar',
        trade: 'Heavy Duty Trailer Driver',
        source: 'EXCEL',
        isPassportHolder: 'YES',
        passportNumber: 'P7823901',
        currentStage: 'UNASSIGNED',
        assignedStaffHead: staffHead._id,
        notes: 'Valid Qatar Heavy License held. Awaiting calling staff round-robin allocation.',
        applicationForm: {
          trade: 'Heavy Duty Trailer Driver',
          experienceYears: '8 Years (Ex-Qatar)',
          preferredCountries: ['Qatar', 'Saudi Arabia'],
          expectedSalary: '2,400 QAR',
          city: 'Siwan',
          state: 'Bihar'
        }
      },
      {
        leadId: 'LEAD-1004',
        candidateName: 'Vikram Singh Rawat',
        phone: '+91 99887 76655',
        email: 'vikram.hvac@gmail.com',
        city: 'Deoria',
        state: 'Uttar Pradesh',
        trade: 'HVAC Technician & Chiller Operator',
        source: 'WHATSAPP',
        isPassportHolder: 'NOT_CONFIRMED',
        passportNumber: null,
        currentStage: 'CALLING_SCREENING',
        assignedStaffHead: staffHead._id,
        assignedCallingStaff: callingStaff1._id,
        notes: 'Candidate claims passport applied at Gorakhpur RPO. Follow-up required.',
        applicationForm: {
          trade: 'HVAC Technician & Chiller Operator',
          experienceYears: '3 Years',
          preferredCountries: ['Kuwait', 'Oman'],
          city: 'Deoria',
          state: 'Uttar Pradesh'
        }
      },
      {
        leadId: 'LEAD-1005',
        candidateName: 'Dinesh Pal',
        phone: '+91 91234 56789',
        email: 'dinesh.mason@gmail.com',
        city: 'Balia',
        state: 'Uttar Pradesh',
        trade: 'Civil Finishing Mason & Tiler',
        source: 'MANUAL',
        isPassportHolder: 'NO',
        passportNumber: null,
        currentStage: 'CALLING_SCREENING',
        assignedStaffHead: staffHead._id,
        assignedCallingStaff: callingStaff2._id,
        isHold: true,
        holdReason: 'Non-passport candidate. Put on hold until passport application is submitted.',
        notes: 'Does not have a passport currently. Quarantined per business gatekeeper rules.',
        applicationForm: {
          trade: 'Civil Finishing Mason & Tiler',
          experienceYears: '2 Years',
          city: 'Balia',
          state: 'Uttar Pradesh'
        }
      }
    ];

    for (const leadData of sampleLeads) {
      const existing = await Lead.findOne({ leadId: leadData.leadId });
      if (!existing) {
        const lead = await Lead.create(leadData);
        await LeadHistory.create({
          lead: lead._id,
          leadIdStr: lead.leadId,
          performedBy: {
            userId: admin._id,
            name: admin.name,
            role: admin.role
          },
          actionType: 'LEAD_CREATED',
          toStage: lead.currentStage,
          remarks: `Initial seed candidate created via ${lead.source}`
        });
        console.log(`✅ Created lead ${lead.leadId} - ${lead.candidateName}`);
      } else {
        console.log(`ℹ️ Lead ${leadData.leadId} already exists.`);
      }
    }

    console.log('\n🎉 Sourcing Pool Seeded Successfully with FRD Leads!\n');
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('❌ Error seeding leads:', err.message);
    process.exit(1);
  }
};

seedLeads();
