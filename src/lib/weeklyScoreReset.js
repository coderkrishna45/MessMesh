import { randomUUID } from 'node:crypto';
import User from './models/User.js';
import WeeklyScoreSnapshot from './models/WeeklyScoreSnapshot.js';
import WeeklyScoreState from './models/WeeklyScoreState.js';
import { formatISODate, getMondayUTC } from './weekUtils.js';

const WINGS = ['A-Wing', 'B-Wing', 'C-Wing', 'D-Wing'];
const RESET_LOCK_LEASE_MS = 2 * 60 * 1000;
const RESET_LOCK_WAIT_MS = 15 * 1000;
export const WEEKLY_RESET_SCORE = 0;

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function acquireLock() {
  const owner = randomUUID();
  const startedAt = Date.now();

  while (Date.now() - startedAt < RESET_LOCK_WAIT_MS) {
    const now = new Date();
    try {
      const state = await WeeklyScoreState.findOneAndUpdate(
        {
          _id: 'global',
          $or: [
            { leaseExpiresAt: { $exists: false } },
            { leaseExpiresAt: { $lte: now } },
          ],
        },
        {
          $set: {
            leaseOwner: owner,
            leaseExpiresAt: new Date(now.getTime() + RESET_LOCK_LEASE_MS),
          },
        },
        { upsert: true, returnDocument: 'after' }
      );
      if (state?.leaseOwner === owner) return { owner, state };
    } catch (error) {
      if (error?.code !== 11000) throw error;
    }

    await delay(50);
  }

  throw new Error('Timed out waiting for the weekly score lock.');
}

async function releaseLock(owner) {
  await WeeklyScoreState.updateOne(
    { _id: 'global', leaseOwner: owner },
    { $unset: { leaseOwner: 1, leaseExpiresAt: 1 } }
  );
}

function snapshotForWeek(students, weekStart) {
  const studentCount = students.length;
  const totalScore = students.reduce((sum, student) => sum + (student.cleanPlateScore ?? 0), 0);
  const hostelAvg = studentCount > 0 ? Math.round(totalScore / studentCount) : 0;
  const wings = WINGS.map((wing) => {
    const list = students.filter((student) => student.wing === wing);
    const scoreSum = list.reduce(
      (sum, student) => sum + (student.cleanPlateScore ?? 0),
      0
    );
    return {
      wing,
      avgScore: list.length > 0 ? Math.round(scoreSum / list.length) : 0,
      studentCount: list.length,
    };
  }).sort((a, b) => b.avgScore - a.avgScore);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
  weekEnd.setUTCHours(23, 59, 59, 999);

  return {
    weekStartDate: weekStart,
    weekEndDate: weekEnd,
    status: 'PENDING',
    hostelAvg,
    studentCount,
    wings,
    topStudents: [...students]
      .sort((a, b) => (b.cleanPlateScore ?? 0) - (a.cleanPlateScore ?? 0))
      .slice(0, 10)
      .map((student) => ({
        user: student._id,
        name: student.name,
        wing: student.wing,
        cleanPlateScore: student.cleanPlateScore ?? 0,
      })),
  };
}

async function createOrReadSnapshot(weekStart) {
  try {
    return await WeeklyScoreSnapshot.findOneAndUpdate(
      { weekStartDate: weekStart },
      { $setOnInsert: snapshotForWeek(
        await User.find({ role: 'STUDENT' })
          .select('name wing cleanPlateScore')
          .lean(),
        weekStart
      ) },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );
  } catch (error) {
    if (error?.code !== 11000) throw error;
    return WeeklyScoreSnapshot.findOne({ weekStartDate: weekStart });
  }
}

async function synchronizeWeekUnderLock(lockOwner, requestedDate) {
  const requestedWeek = getMondayUTC(requestedDate);
  const state = await WeeklyScoreState.findById('global');
  if (!state?.currentWeekStart) {
    await User.updateMany(
      {
        role: 'STUDENT',
        $or: [
          { cleanPlateScoreWeekStart: { $exists: false } },
          { cleanPlateScoreWeekStart: null },
        ],
      },
      { $set: { cleanPlateScoreWeekStart: requestedWeek } }
    );
    await WeeklyScoreState.updateOne(
      { _id: 'global', leaseOwner: lockOwner },
      { $set: { currentWeekStart: requestedWeek } }
    );
    return {
      rolled: false,
      archived: false,
      currentWeekStart: requestedWeek,
      studentsReset: 0,
    };
  }

  const storedWeek = getMondayUTC(state.currentWeekStart);
  if (storedWeek.getTime() >= requestedWeek.getTime()) {
    return {
      rolled: false,
      archived: false,
      currentWeekStart: storedWeek,
      studentsReset: 0,
    };
  }

  const snapshot = await createOrReadSnapshot(storedWeek);
  if (!snapshot) throw new Error('Could not create or recover the weekly score snapshot.');

  const reset = await User.updateMany(
    {
      role: 'STUDENT',
      $or: [
        { cleanPlateScoreWeekStart: { $exists: false } },
        { cleanPlateScoreWeekStart: null },
        { cleanPlateScoreWeekStart: { $lt: requestedWeek } },
      ],
    },
    {
      $set: {
        cleanPlateScore: WEEKLY_RESET_SCORE,
        cleanPlateScoreWeekStart: requestedWeek,
      },
    }
  );

  await WeeklyScoreSnapshot.updateOne(
    { weekStartDate: storedWeek },
    { $set: { status: 'COMPLETED' } }
  );
  await WeeklyScoreState.updateOne(
    { _id: 'global', leaseOwner: lockOwner },
    { $set: { currentWeekStart: requestedWeek } }
  );

  return {
    rolled: true,
    archived: true,
    hostelAvg: snapshot.hostelAvg,
    studentsReset: reset.modifiedCount ?? 0,
    weekStart: formatISODate(storedWeek),
    currentWeekStart: requestedWeek,
    resetTo: WEEKLY_RESET_SCORE,
  };
}

export async function ensureWeeklyScorePeriod(applicationDate) {
  const lock = await acquireLock();
  try {
    return await synchronizeWeekUnderLock(lock.owner, applicationDate);
  } finally {
    await releaseLock(lock.owner);
  }
}

export async function maybeResetScoresOnWeekRollover(prevDate, nextDate) {
  const prevWeek = getMondayUTC(prevDate);
  const nextWeek = getMondayUTC(nextDate);
  if (nextWeek.getTime() <= prevWeek.getTime()) return { rolled: false };

  await ensureWeeklyScorePeriod(prevDate);
  return ensureWeeklyScorePeriod(nextDate);
}

export async function recordCleanPlateScoreDelta(userId, delta, applicationDate) {
  const lock = await acquireLock();
  try {
    const period = await synchronizeWeekUnderLock(lock.owner, applicationDate);
    const weekStart = period.currentWeekStart;
    if (!weekStart) throw new Error('Weekly score period is unavailable.');

    await User.updateOne(
      {
        _id: userId,
        role: 'STUDENT',
        cleanPlateScoreWeekStart: { $ne: weekStart },
      },
      {
        $set: {
          cleanPlateScore: WEEKLY_RESET_SCORE,
          cleanPlateScoreWeekStart: weekStart,
        },
      }
    );

    const user = await User.findOne({ _id: userId, role: 'STUDENT' });
    if (!user) return null;

    user.cleanPlateScore = Math.max(
      0,
      Math.min(100, (user.cleanPlateScore ?? 0) + delta)
    );
    user.cleanPlateScoreWeekStart = weekStart;
    await user.save();
    return user;
  } finally {
    await releaseLock(lock.owner);
  }
}
