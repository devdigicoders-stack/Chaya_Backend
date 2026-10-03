/**
 * Indian Public Holidays, Festivals, and Dynamic Refund Calendar Scheduler
 * Chhaya International Accounts & Compliance System
 *
 * Excludes:
 * 1. Saturdays (Day 6) & Sundays (Day 0)
 * 2. Gazetted Public Holidays & Festivals (2025 - 2027+)
 *
 * Daily Quota: ₹20,000 - ₹25,000 per working day
 */

// Daily Maximum Refund Disbursement Cap (in INR)
const DAILY_REFUND_CAP = 25000;

// Curated list of Indian National & Cultural Festivals / Gazetted Holidays
const HOLIDAYS = {
  // ─── 2025 Holidays ───
  '2025-01-01': 'New Year\'s Day',
  '2025-01-14': 'Makar Sankranti / Pongal',
  '2025-01-26': 'Republic Day',
  '2025-02-26': 'Maha Shivratri',
  '2025-03-14': 'Holi',
  '2025-03-31': 'Eid-ul-Fitr',
  '2025-04-06': 'Ram Navami',
  '2025-04-10': 'Mahavir Jayanti',
  '2025-04-14': 'Dr. B.R. Ambedkar Jayanti',
  '2025-04-18': 'Good Friday',
  '2025-05-01': 'May Day / Labour Day',
  '2025-05-12': 'Buddha Purnima',
  '2025-06-07': 'Bakrid / Eid-ul-Adha',
  '2025-07-06': 'Muharram',
  '2025-08-15': 'Independence Day',
  '2025-08-16': 'Janmashtami',
  '2025-09-05': 'Milad-un-Nabi',
  '2025-10-02': 'Mahatma Gandhi Jayanti',
  '2025-10-02': 'Dussehra / Vijayadashami',
  '2025-10-20': 'Diwali / Deepavali',
  '2025-10-21': 'Govardhan Puja',
  '2025-10-22': 'Bhai Dooj',
  '2025-11-05': 'Guru Nanak Jayanti',
  '2025-12-25': 'Christmas Day',

  // ─── 2026 Holidays ───
  '2026-01-01': 'New Year\'s Day',
  '2026-01-14': 'Makar Sankranti / Pongal',
  '2026-01-26': 'Republic Day',
  '2026-02-15': 'Maha Shivratri',
  '2026-03-03': 'Holika Dahan',
  '2026-03-04': 'Holi',
  '2026-03-20': 'Eid-ul-Fitr',
  '2026-03-27': 'Ram Navami',
  '2026-03-31': 'Mahavir Jayanti',
  '2026-04-03': 'Good Friday',
  '2026-04-14': 'Dr. B.R. Ambedkar Jayanti',
  '2026-05-01': 'May Day / Labour Day',
  '2026-05-02': 'Buddha Purnima',
  '2026-05-27': 'Bakrid / Eid-ul-Adha',
  '2026-06-26': 'Muharram',
  '2026-08-15': 'Independence Day',
  '2026-09-04': 'Janmashtami',
  '2026-09-15': 'Milad-un-Nabi',
  '2026-10-02': 'Mahatma Gandhi Jayanti',
  '2026-10-20': 'Dussehra / Vijayadashami',
  '2026-11-08': 'Diwali / Deepavali',
  '2026-11-09': 'Govardhan Puja',
  '2026-11-10': 'Bhai Dooj',
  '2026-11-24': 'Guru Nanak Jayanti',
  '2026-12-25': 'Christmas Day',

  // ─── 2027 Holidays ───
  '2027-01-01': 'New Year\'s Day',
  '2027-01-14': 'Makar Sankranti',
  '2027-01-26': 'Republic Day',
  '2027-03-06': 'Maha Shivratri',
  '2027-03-22': 'Holi',
  '2027-03-10': 'Eid-ul-Fitr',
  '2027-03-26': 'Good Friday',
  '2027-04-14': 'Ambedkar Jayanti',
  '2027-04-15': 'Ram Navami',
  '2027-05-17': 'Bakrid / Eid-ul-Adha',
  '2027-08-15': 'Independence Day',
  '2027-08-25': 'Janmashtami',
  '2027-10-02': 'Mahatma Gandhi Jayanti',
  '2027-10-09': 'Dussehra',
  '2027-10-29': 'Diwali',
  '2027-11-14': 'Guru Nanak Jayanti',
  '2027-12-25': 'Christmas Day'
};

/**
 * Format a Date object to YYYY-MM-DD in local time
 */
const formatDateKey = (date) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Get holiday name if date is a festival / gazetted holiday
 */
const getHolidayName = (date) => {
  const key = formatDateKey(date);
  return HOLIDAYS[key] || null;
};

/**
 * Check if given date is a non-working day (Saturday, Sunday, or Festival/Holiday)
 */
const isNonWorkingDay = (date) => {
  const d = new Date(date);
  const dayOfWeek = d.getDay(); // 0 = Sunday, 6 = Saturday
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return true;
  }
  const holidayName = getHolidayName(date);
  return !!holidayName;
};

/**
 * Check day details including weekend, holiday name, and working status
 */
const getDayDetails = (date) => {
  const d = new Date(date);
  const dayOfWeek = d.getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const weekendName = dayOfWeek === 0 ? 'Sunday' : dayOfWeek === 6 ? 'Saturday' : null;
  const holidayName = getHolidayName(date);
  const isWorking = !isWeekend && !holidayName;

  return {
    dateKey: formatDateKey(date),
    dayOfWeek,
    isWeekend,
    weekendName,
    isHoliday: !!holidayName,
    holidayName,
    isWorkingDay: isWorking
  };
};

/**
 * Auto-find next eligible working day where:
 * 1. Day is NOT Saturday or Sunday
 * 2. Day is NOT a Public Holiday / Festival
 * 3. Total scheduled refunds for that day + refundAmount <= DAILY_REFUND_CAP (₹25,000)
 *
 * @param {Number} refundAmount - Amount to be refunded for the candidate
 * @param {Model} LeadModel - Mongoose Lead Model
 * @param {Date|null} startFromDate - Optional starting date (defaults to tomorrow)
 * @returns {Promise<Object>} { scheduledDate, dateKey, alreadyScheduled, remainingCapacity, cap }
 */
const findNextAvailableRefundDate = async (refundAmount, LeadModel, startFromDate = null) => {
  const amount = Number(refundAmount) || 0;
  
  // Start scheduling from next day (tomorrow)
  let checkDate = startFromDate ? new Date(startFromDate) : new Date();
  checkDate.setDate(checkDate.getDate() + 1);
  checkDate.setHours(0, 0, 0, 0);

  const maxDaysToScan = 90; // Scan up to 90 days ahead
  let daysScanned = 0;

  while (daysScanned < maxDaysToScan) {
    daysScanned++;

    const dayDetails = getDayDetails(checkDate);

    // Skip Saturday, Sunday, and Festivals / Public Holidays
    if (!dayDetails.isWorkingDay) {
      checkDate.setDate(checkDate.getDate() + 1);
      continue;
    }

    // Working day found -> check current scheduled load in database
    const startOfDay = new Date(checkDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(checkDate);
    endOfDay.setHours(23, 59, 59, 999);

    // Find all leads with scheduled refund on this day that are still pending
    const scheduledLeadsOnDay = await LeadModel.find({
      $or: [
        { scheduledRefundDate: { $gte: startOfDay, $lte: endOfDay } },
        { 'closureDetails.scheduledRefundDate': { $gte: startOfDay, $lte: endOfDay } }
      ],
      closureStatus: { $in: ['REFUND_PENDING', 'FINANCIAL_PENDING'] }
    }).select('closureDetails billBook candidateName leadId').lean();

    // Sum currently scheduled amount
    let alreadyScheduled = 0;
    scheduledLeadsOnDay.forEach(lead => {
      const payable = lead.closureDetails?.refundPayable || lead.billBook?.approvedRefund || 0;
      const paid = lead.closureDetails?.refundPaid || lead.billBook?.refundPaid || 0;
      const balance = Math.max(0, payable - paid);
      alreadyScheduled += balance > 0 ? balance : payable;
    });

    // Check if adding this candidate's refund fits within the daily cap (₹25,000)
    // If alreadyScheduled is 0, we can allocate up to DAILY_REFUND_CAP.
    // If a candidate's single refund exceeds ₹25,000, allocate them on the first clean day.
    if ((alreadyScheduled + amount) <= DAILY_REFUND_CAP || (alreadyScheduled === 0 && amount > DAILY_REFUND_CAP)) {
      return {
        scheduledDate: new Date(checkDate),
        dateKey: dayDetails.dateKey,
        alreadyScheduled,
        amountScheduled: amount,
        totalDayScheduled: alreadyScheduled + amount,
        dailyCap: DAILY_REFUND_CAP,
        scheduledCandidatesCount: scheduledLeadsOnDay.length + 1
      };
    }

    // Day is full (or exceeds ₹25,000 limit) -> advance to next day
    checkDate.setDate(checkDate.getDate() + 1);
  }

  // Fallback if 90 days full (very rare): return 14 days from now
  const fallback = new Date();
  fallback.setDate(fallback.getDate() + 14);
  return {
    scheduledDate: fallback,
    dateKey: formatDateKey(fallback),
    alreadyScheduled: 0,
    amountScheduled: amount,
    totalDayScheduled: amount,
    dailyCap: DAILY_REFUND_CAP,
    scheduledCandidatesCount: 1
  };
};

module.exports = {
  DAILY_REFUND_CAP,
  HOLIDAYS,
  formatDateKey,
  getHolidayName,
  isNonWorkingDay,
  getDayDetails,
  findNextAvailableRefundDate
};
