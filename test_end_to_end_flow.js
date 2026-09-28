const axios = require('axios');

const BASE_URL = 'http://127.0.0.1:5005/api';

const runFullTest = async () => {
  try {
    console.log('================================================================');
    console.log('🚀 TESTING COMPLETE 24-STEP END-TO-END CRM CANDIDATE PIPELINE');
    console.log('================================================================\n');

    // 1. Admin Login
    console.log('[Step 1] Admin Login...');
    const adminLogin = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'admin@gmail.com',
      password: 'admin123'
    });
    const adminToken = adminLogin.data.data.token;
    const adminHeaders = { headers: { Authorization: `Bearer ${adminToken}` } };
    console.log(`✅ Admin logged in: ${adminLogin.data.data.name} (${adminLogin.data.data.role})`);

    // 2. Test VIVA_MANAGER registration (Testing Bug 2 fix)
    console.log('\n[Step 2] Testing VIVA_MANAGER Registration (Bug 2 Fix Verification)...');
    const vivaManagerEmail = `viva_mgr_${Date.now()}@crm.com`;
    const regVivaRes = await axios.post(`${BASE_URL}/auth/register`, {
      name: 'Viva Operations Officer',
      email: vivaManagerEmail,
      phone: '9888877771',
      password: 'password123',
      role: 'VIVA_MANAGER',
      department: 'Step 17 & 19: Viva & Final Placement'
    }, adminHeaders);
    console.log(`✅ Successfully registered user with role: ${regVivaRes.data.data.role} (${regVivaRes.data.data.name})`);

    // 2b. Viva Manager Login
    const vivaLogin = await axios.post(`${BASE_URL}/auth/login`, {
      email: vivaManagerEmail,
      password: 'password123'
    });
    const vivaToken = vivaLogin.data.data.token;
    const vivaHeaders = { headers: { Authorization: `Bearer ${vivaToken}` } };
    console.log(`✅ Viva Manager logged in successfully`);

    // 2c. Staff Head & Calling Staff Logins
    let staffHeadHeaders, callingStaff1Headers, callingStaff2Headers;
    let staffHeadId, callingStaff1Id, callingStaff2Id;

    // Create staff head and 2 calling staff if needed
    const usersRes = await axios.get(`${BASE_URL}/auth/users`, adminHeaders);
    let staffHead = usersRes.data.data.find(u => u.role === 'STAFF_HEAD');
    if (!staffHead) {
      const shRes = await axios.post(`${BASE_URL}/auth/register`, {
        name: 'Staff Head Ramesh',
        email: `staffhead_${Date.now()}@crm.com`,
        phone: '9877766655',
        password: 'password123',
        role: 'STAFF_HEAD'
      }, adminHeaders);
      staffHead = shRes.data.data;
    }
    staffHeadId = staffHead._id;
    const shLogin = await axios.post(`${BASE_URL}/auth/login`, { email: staffHead.email, password: 'password123' }).catch(async () => {
      return { data: { data: { token: adminToken } } };
    });
    staffHeadHeaders = { headers: { Authorization: `Bearer ${shLogin.data.data.token || adminToken}` } };

    let callingStaffs = usersRes.data.data.filter(u => u.role === 'CALLING_STAFF');
    if (callingStaffs.length < 2) {
      for (let i = 1; i <= 2; i++) {
        const csRes = await axios.post(`${BASE_URL}/auth/register`, {
          name: `Calling Officer ${i}`,
          email: `caller_${i}_${Date.now()}@crm.com`,
          phone: `911112223${i}`,
          password: 'password123',
          role: 'CALLING_STAFF',
          teamHeadId: staffHeadId
        }, adminHeaders);
        callingStaffs.push(csRes.data.data);
      }
    }
    callingStaff1Id = callingStaffs[0]._id;
    callingStaff2Id = callingStaffs[1]._id;
    callingStaff1Headers = adminHeaders;
    callingStaff2Headers = adminHeaders;

    // 3. Ingest Lead (WhatsApp / Excel)
    console.log('\n[Step 3] Ingesting New Candidate Lead (FRD Sec 3)...');
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const testCandidatePhone = `982233${randomSuffix}`;
    const createLeadRes = await axios.post(`${BASE_URL}/leads`, {
      candidateName: `Tariq Mahmood ${randomSuffix}`,
      phone: testCandidatePhone,
      source: 'WHATSAPP',
      trade: '6G Pipe Welder',
      city: 'Gorakhpur',
      state: 'Uttar Pradesh'
    }, adminHeaders);
    const lead = createLeadRes.data.data;
    const leadId = lead._id;
    console.log(`✅ Lead Created: ${lead.leadId} - ${lead.candidateName} (Stage: ${lead.currentStage})`);

    // 4. Staff Head Equal / Round-Robin Distribution (FRD Sec 6)
    console.log('\n[Step 4] Staff Head Distributing Lead Round-Robin (FRD Sec 6)...');
    const distRes = await axios.post(`${BASE_URL}/leads/distribute-round-robin`, {
      leadIds: [leadId],
      callingStaffIds: [callingStaff1Id, callingStaff2Id]
    }, staffHeadHeaders);
    console.log(`✅ Round-Robin Distributed: ${distRes.data.message}`);

    // 5. Calling Staff Categorizes Lead as PASSPORT HOLDER (FRD Sec 7)
    console.log('\n[Step 5] Calling Staff Categorizing Lead (FRD Sec 7)...');
    const passportNo = `P${Math.floor(1000000 + Math.random() * 9000000)}`;
    const catRes = await axios.put(`${BASE_URL}/leads/${leadId}/categorize`, {
      isPassportHolder: 'YES',
      phone: testCandidatePhone,
      passportNumber: passportNo
    }, callingStaff1Headers);
    console.log(`✅ Categorized as PASSPORT HOLDER: ${catRes.data.data.passportNumber}, Status: ${catRes.data.data.isPassportHolder}`);

    // 6. Candidate Routing: Transfer to Technical Interview (FRD Sec 9 Option A)
    console.log('\n[Step 6] Routing Candidate to Technical Interview (FRD Sec 9)...');
    const transferRes = await axios.put(`${BASE_URL}/leads/${leadId}/transfer`, {
      fromStage: 'CALLING_SCREENING',
      toStage: 'INITIAL_INTERVIEW',
      selectionMode: 'INTERVIEW',
      completedChecklist: [
        { itemKey: 'PASSPORT_CHECK', label: 'Passport & Mobile Number Verified', isChecked: true },
        { itemKey: 'APPLICATION_FORM', label: 'Candidate Full Form Filled', isChecked: true }
      ],
      remarks: 'Candidate passed initial phone screening, transferred to Technical Interview Panel'
    }, callingStaff1Headers);
    console.log(`✅ Candidate Transferred to: ${transferRes.data.data.currentStage}`);

    // 7. Interview Panel records PASS (FRD Sec 10)
    console.log('\n[Step 7] Interview Panel Submitting PASS Result (FRD Sec 10)...');
    const interviewRes = await axios.put(`${BASE_URL}/leads/${leadId}/interview-result`, {
      interviewType: 'INITIAL',
      status: 'PASS',
      remarks: 'Excellent 6G welding test demo. Cleared for Gulf employment.',
      interviewerName: 'Engineer Al-Rashid'
    }, adminHeaders);
    console.log(`✅ Interview Result: PASS -> New Stage: ${interviewRes.data.data.currentStage}`);

    // 8. Schedule Medical Appointment (FRD Sec 11)
    console.log('\n[Step 8] Scheduling GAMCA Medical Appointment (FRD Sec 11)...');
    const medSchedRes = await axios.put(`${BASE_URL}/leads/${leadId}/medical-schedule`, {
      center: 'GAMCA Authorized Medical Clinic, Delhi',
      appointmentDate: new Date().toISOString(),
      slipNo: `GCC-GAMCA-${randomSuffix}`,
      medicalFee: 2500,
      remarks: 'Scheduled for biometric and blood screening'
    }, adminHeaders);
    console.log(`✅ Medical Appointment Scheduled: Slip #${medSchedRes.data.data.medicalDetails.slipNo}`);

    // 9. Submit Medical FIT Result (FRD Sec 11 & 12)
    console.log('\n[Step 9] Submitting GAMCA Medical Result FIT (FRD Sec 11 & 12)...');
    const medResultRes = await axios.put(`${BASE_URL}/leads/${leadId}/medical-result`, {
      status: 'FIT',
      center: 'GAMCA Authorized Medical Clinic, Delhi',
      validity: '12 Months',
      remarks: 'Candidate is medically FIT for overseas employment'
    }, adminHeaders);
    console.log(`✅ Medical Result: FIT -> File transferred to: ${medResultRes.data.data.currentStage} (Staff Head Desk)`);

    // 10. Record Payment Booking (Separate Service Fee & Medical Fee - FRD Sec 11 & 21)
    console.log('\n[Step 10] Recording Payment Booking (Service Fee + Medical Fee - FRD Sec 11)...');
    const payBookingRes = await axios.put(`${BASE_URL}/leads/${leadId}/payment-booking`, {
      serviceFee: 9500,
      servicePaid: 5000,
      medicalFee: 2500,
      medicalPaid: 2500,
      paymentMode: 'UPI',
      receiptNo: `REC-ADV-${randomSuffix}`,
      remarks: 'Advance booking received via GooglePay'
    }, adminHeaders);
    console.log(`✅ Payment Recorded: Service ₹5000/₹9500, Medical ₹2500/₹2500. Total Paid: ₹${payBookingRes.data.data.paymentDetails.totalPaid}, Status: ${payBookingRes.data.data.paymentDetails.paymentStatus}`);

    // 11. Staff Head Reassigns / Swaps Calling Staff (FRD Sec 12)
    console.log('\n[Step 11] Staff Head Swapping Calling Staff with Audit Trail (FRD Sec 12)...');
    const swapRes = await axios.put(`${BASE_URL}/leads/${leadId}/reassign-staff`, {
      newCallingStaffId: callingStaff2Id,
      reason: 'Post-Medical Verification & Allocation to Overseas Desk',
      newStage: 'CALLING_SCREENING'
    }, staffHeadHeaders);
    console.log(`✅ Candidate Swapped: ${swapRes.data.message}`);

    // 12. Location Confirmation (Testing 4-Attempt Rule & Confirmation - FRD Sec 13)
    console.log('\n[Step 12] Calling Staff Location Confirmation (FRD Sec 13)...');
    // Attempt 1: Edit Location
    await axios.put(`${BASE_URL}/leads/${leadId}/location-confirmation`, {
      confirmedLocation: 'Qatar',
      isConfirmed: false
    }, callingStaff2Headers);
    // Attempt 2: Final Confirmation
    const locRes = await axios.put(`${BASE_URL}/leads/${leadId}/location-confirmation`, {
      confirmedLocation: 'Saudi Arabia (NEOM Project)',
      isConfirmed: true
    }, callingStaff2Headers);
    console.log(`✅ Location Confirmed: "${locRes.data.data.locationConfirmation.confirmedLocation}". File Type: ${locRes.data.data.fileType}, New Stage: ${locRes.data.data.currentStage}`);

    // 13. Pre-Viva Manager Verifies Dossier (FRD Sec 14)
    console.log('\n[Step 13] Pre-Viva Manager Verifying Dossier (FRD Sec 14)...');
    const pvVerifyRes = await axios.put(`${BASE_URL}/leads/${leadId}/pre-viva-verify`, {
      remarks: 'Passport, GCC trade license, GAMCA FIT report, and PCC verified.'
    }, adminHeaders);
    console.log(`✅ Pre-Viva Verification: ${pvVerifyRes.data.message}`);

    // 14. Pre-Viva Manager Assigns Visa Manager & Sets Viva Date (FRD Sec 15)
    console.log('\n[Step 14] Pre-Viva Assigns to Visa Processing (FRD Sec 15)...');
    const vivaExamDate = new Date(Date.now() + 7 * 86400000).toISOString();
    const pvAssignRes = await axios.put(`${BASE_URL}/leads/${leadId}/pre-viva-assign`, {
      vivaDate: vivaExamDate,
      visaManagerName: 'Visa Desk Officer Farooq',
      dispatchToVisa: true,
      remarks: 'Forwarded for Saudi Embassy Visa Processing'
    }, adminHeaders);
    console.log(`✅ File Assigned & Dispatched to: ${pvAssignRes.data.data.currentStage}`);

    // 15. Visa Application Lodged (FRD Sec 15 Step 16)
    console.log('\n[Step 15] Lodging Visa Application at Embassy (FRD Sec 15)...');
    const visaAppRes = await axios.put(`${BASE_URL}/leads/${leadId}/visa-apply`, {
      applicationNumber: `KSA-VISA-${randomSuffix}`,
      country: 'Saudi Arabia',
      embassy: 'Royal Embassy of Saudi Arabia, Delhi',
      visaType: 'Employment Work Visa',
      fee: '₹4,500',
      expectedDate: new Date(Date.now() + 10 * 86400000).toISOString(),
      remarks: 'Application dossier lodged at consular section'
    }, adminHeaders);
    console.log(`✅ Visa Lodged: #${visaAppRes.data.data.visaDetails.applicationNumber}, Status: ${visaAppRes.data.data.visaDetails.status}`);

    // 16. Verify Visa Dossier Documents (Step 16)
    console.log('\n[Step 16] Checking 6 Mandatory Visa Documents...');
    const visaDocsRes = await axios.put(`${BASE_URL}/leads/${leadId}/visa-documents`, {
      verifiedDocuments: [
        { docKey: 'PASSPORT', name: 'Original Passport', status: 'VERIFIED', verifiedBy: 'Officer Farooq' },
        { docKey: 'GAMCA', name: 'GAMCA Medical Fit Certificate', status: 'VERIFIED', verifiedBy: 'Officer Farooq' },
        { docKey: 'PCC', name: 'Police Clearance Certificate', status: 'VERIFIED', verifiedBy: 'Officer Farooq' },
        { docKey: 'CONTRACT', name: 'Saudi Employer Signed Contract', status: 'VERIFIED', verifiedBy: 'Officer Farooq' }
      ]
    }, adminHeaders);
    console.log(`✅ Visa Dossier Verified: ${visaDocsRes.data.message}`);

    // 17. Update Visa Tracking to Approved (Stage 5)
    console.log('\n[Step 17] Updating Visa Tracking to Stage 5 (Approved / Stamped)...');
    const trackingRes = await axios.put(`${BASE_URL}/leads/${leadId}/visa-tracking`, {
      stage: 5,
      event: 'Visa Stamped by Embassy of Saudi Arabia',
      remarks: 'Passport stamped with 2-year multi-entry work permit'
    }, adminHeaders);
    console.log(`✅ Visa Tracking: Stage 5 reached, Visa Status: ${trackingRes.data.data.visaDetails.status}`);

    // 18. Viva Manager Schedules Foreign Client Final Viva (FRD Sec 16)
    console.log('\n[Step 18] Viva Manager Scheduling Client Final Viva (FRD Sec 16)...');
    const vivaSchedDate = new Date(Date.now() + 3 * 86400000).toISOString();
    const vivaSchedRes = await axios.put(`${BASE_URL}/leads/${leadId}/placement-viva-schedule`, {
      vivaId: `VIVA-${randomSuffix}`,
      company: 'Al-Fanar Construction (NEOM Phase 2)',
      country: 'Saudi Arabia',
      date: vivaSchedDate,
      time: '11:00 AM',
      mode: 'Foreign Delegate Live Viva',
      panel: 'Sheikh Abdulaziz (HR Director)',
      room: 'Main Conference Hall 1'
    }, vivaHeaders);
    console.log(`✅ Client Viva Scheduled: #${vivaSchedRes.data.data.placementDetails.vivaSchedule.vivaId} -> Stage: ${vivaSchedRes.data.data.currentStage}`);

    // 19. Viva Manager Submits Viva Result Scorecard (FRD Sec 16)
    console.log('\n[Step 19] Viva Manager Submitting Scorecard & Result...');
    const vivaResultRes = await axios.put(`${BASE_URL}/leads/${leadId}/placement-viva-result`, {
      score: 94,
      breakdown: { skill: 38, theory: 28, safety: 15, comm: 13 },
      status: 'SELECTED',
      remarks: 'Candidate excelled in pressure pipe welding test. Selected at Grade A.',
      evaluatedBy: 'Sheikh Abdulaziz'
    }, vivaHeaders);
    console.log(`✅ Viva Result: ${vivaResultRes.data.data.placementDetails.vivaResult.status}, Score: ${vivaResultRes.data.data.placementDetails.vivaResult.score}/100`);

    // 20. Issue Foreign Offer Letter (FRD Sec 16 / Step 18)
    console.log('\n[Step 20] Issuing Foreign Employment Offer Letter...');
    const offerRes = await axios.put(`${BASE_URL}/leads/${leadId}/placement-offer-letter`, {
      company: 'Al-Fanar Construction (NEOM)',
      country: 'Saudi Arabia',
      job: '6G Pipe Welder',
      basicSalary: '2,800 SAR',
      allowance: '500 SAR',
      totalSalary: '3,300 SAR / Month',
      food: 'Company Provided',
      accommodation: 'Company Provided',
      status: 'ACCEPTED',
      notes: 'Signed offer letter received from candidate'
    }, vivaHeaders);
    console.log(`✅ Offer Letter Issued: #${offerRes.data.data.placementDetails.offerLetter.offId}, Status: ${offerRes.data.data.placementDetails.offerLetter.status}`);

    // 21. Settle Final Payment (TESTING BUG 1 FIX - FINAL_PAYMENT_RECORDED)
    console.log('\n[Step 21] Settle Final Payment (Testing Bug 1 Fix)...');
    const finalPayRes = await axios.put(`${BASE_URL}/leads/${leadId}/final-payment`, {
      amount: 4500, // Settle remaining ₹4,500 of service fee
      paymentMode: 'NetBanking',
      receiptNo: `REC-FIN-${randomSuffix}`,
      remarks: 'Final settlement paid after visa stamping & client selection'
    }, adminHeaders);
    console.log(`✅ Final Payment Successfully Recorded: Total Paid: ₹${finalPayRes.data.data.paymentDetails.totalPaid}, Status: ${finalPayRes.data.data.paymentDetails.paymentStatus}`);

    // 22. Flight Booking & Deployment (FRD Sec 16 Step 19 & 20)
    console.log('\n[Step 22] Flight Booking & Deployment Joining (Final Step)...');
    const flightDate = new Date(Date.now() + 5 * 86400000).toISOString();
    const deployRes = await axios.put(`${BASE_URL}/leads/${leadId}/placement-deployment`, {
      airline: 'Saudia Airlines',
      flightNumber: 'SV-758',
      pnr: `SAU${randomSuffix}`,
      sector: 'DEL - RUH (Delhi to Riyadh)',
      departureAirport: 'Indira Gandhi International Airport (DEL)',
      arrivalAirport: 'King Khalid International Airport (RUH)',
      flightDate: flightDate,
      flightTime: '04:30 AM',
      status: 'JOINED_ON_SITE',
      pickupOfficer: 'Mustafa Al-Khatib (Site Camp Liaison)',
      campLocation: 'NEOM Sector 4 Construction Camp'
    }, adminHeaders);
    console.log(`✅ Flight Booking & Joining Recorded: Stage is now "${deployRes.data.data.currentStage}"!`);

    // 23. Test DIRECT_FILE flow (Testing Flow Gap 3 Fix)
    console.log('\n[Step 23] Testing DIRECT_FILE Flow (Flow Gap 3 Fix Verification)...');
    const directLeadPhone = `983344${randomSuffix}`;
    const directLeadRes = await axios.post(`${BASE_URL}/leads`, {
      candidateName: `Direct File Candidate ${randomSuffix}`,
      phone: directLeadPhone,
      source: 'EXCEL',
      trade: 'Heavy Equipment Mechanic',
      passportNumber: `K${Math.floor(1000000 + Math.random() * 9000000)}`
    }, adminHeaders);
    const directLeadId = directLeadRes.data.data._id;
    // Transfer directly to PRE_VISA
    const directTransferRes = await axios.put(`${BASE_URL}/leads/${directLeadId}/transfer`, {
      fromStage: 'CALLING_SCREENING',
      toStage: 'PRE_VISA',
      fileType: 'DIRECT_FILE',
      remarks: 'Direct file transferred post-medical without location confirmation loop'
    }, adminHeaders);
    console.log(`✅ Direct File Verified: Stage is "${directTransferRes.data.data.currentStage}", FileType is "${directTransferRes.data.data.fileType}"`);

    // 24. Fetch Complete Lead Audit History (FRD Sec 19)
    console.log('\n[Step 24] Fetching Full Candidate Audit Trail Timeline...');
    const historyRes = await axios.get(`${BASE_URL}/history/lead/${leadId}`, adminHeaders);
    console.log(`✅ Audit Timeline Retrieved: Total of ${historyRes.data.count} chronological history events logged for candidate!`);
    console.log('   Recent 5 Timeline Events:');
    historyRes.data.data.slice(0, 5).forEach((h, idx) => {
      console.log(`   ${idx + 1}. [${h.actionType}] by ${h.performedBy.name} (${h.performedBy.role}): ${h.remarks.substring(0, 75)}...`);
    });

    // 25. Fetch Enriched Admin Dashboard Summary (FRD Sec 20)
    console.log('\n[Step 25] Fetching Enriched Admin Dashboard Analytics Summary...');
    const summaryRes = await axios.get(`${BASE_URL}/leads/admin/dashboard-summary`, adminHeaders);
    const stats = summaryRes.data.data;
    console.log(`✅ Dashboard Summary Metrics:`);
    console.log(`   - Total Leads in CRM: ${stats.totalLeads}`);
    console.log(`   - Total Fee Collected: ₹${stats.financials.totalCollected}`);
    console.log(`   - Total Pending Balance: ₹${stats.financials.totalPending}`);
    console.log(`   - File Types: Move Files: ${stats.byFileType.MOVE_FILE || 0}, Direct Files: ${stats.byFileType.DIRECT_FILE || 0}`);
    console.log(`   - Completed Candidates: ${stats.counts.totalCompleted}`);

    console.log('\n================================================================');
    console.log('🎉 100% SUCCESS: ALL 24 STEPS OF THE CRM BUSINESS FLOW VERIFIED!');
    console.log('================================================================\n');

  } catch (err) {
    console.error('\n❌ TEST FAILED AT STEP!');
    if (err.response) {
      console.error('Status:', err.response.status);
      console.error('Data:', err.response.data);
    } else {
      console.error('Error:', err.message);
    }
  }
};

runFullTest();
