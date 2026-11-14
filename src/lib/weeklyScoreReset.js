import User from '@/lib/models/User';
import WeeklyScoreSnapshot from '@/lib/models/WeeklyScoreSnapshot';
import { getMondayUTC, formatISODate } from '@/lib/weekUtils';

const WINGS = ['A-Wing', 'B-Wing', 'C-Wing', 'D-Wing'];

/** Clean Plate Score starts each Monday at 0 and fills through the week (cap 100). */
export const WEEKLY_RESET_SCORE = 0;

/**
 * Snapshot current Clean Plate Scores for a completed week, then reset all students to 0.
 * Idempotent: skips if a snapshot for weekStart already exists.
 *
 * @param {Date} weekStartMonday - Monday of the week that just ended
 */
export async function archiveAndResetCleanPlateScores(weekStartMonday) {
  const weekStart = getMondayUTC(weekStartMonday);
  weekStart.setUTCHours(0, 0, 0, 0);

  const existing = await WeeklyScoreSnapshot.findOne({ weekStartDate: weekStart });
  if (existing) {
    return {
      archived: false,
      hostelAvg: existing.hostelAvg,
      studentsReset: 0,
      reason: 'Snapshot already exists for this week',
    };
  }

  const students = await User.find({ role: 'STUDENT' })
    .select('name wing cleanPlateScore')
    .lean();

  const studentCount = students.length;
  const totalScore = students.reduce((s, u) => s + (u.cleanPlateScore ?? 0), 0);
  const hostelAvg = studentCount > 0 ? Math.round(totalScore / studentCount) : 0;

  const wings = WINGS.map((wing) => {
    const list = students.filter((u) => u.wing === wing);
    const count = list.length;
    const sum = list.reduce((s, u) => s + (u.cleanPlateScore ?? 0), 0);
    return {
      wing,
      avgScore: count > 0 ? Math.round(sum / count) : 0,
      studentCount: count,
    };
  }).sort((a, b) => b.avgScore - a.avgScore);

  const topStudents = [...students]
    .sort((a, b) => (b.cleanPlateScore ?? 0) - (a.cleanPlateScore ?? 0))
    .slice(0, 10)
    .map((u) => ({
      user: u._id,
      name: u.name,
      wing: u.wing,
      cleanPlateScore: u.cleanPlateScore ?? 0,
    }));

  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
  weekEnd.setUTCHours(23, 59, 59, 999);

  await WeeklyScoreSnapshot.create({
    weekStartDate: weekStart,
    weekEndDate: weekEnd,
    hostelAvg,
    studentCount,
    wings,
    topStudents,
  });

  const resetResult = await User.updateMany(
    { role: 'STUDENT' },
    { $set: { cleanPlateScore: WEEKLY_RESET_SCORE } }
  );

  return {
    archived: true,
    hostelAvg,
    studentsReset: resetResult.modifiedCount ?? studentCount,
    weekStart: formatISODate(weekStart),
    resetTo: WEEKLY_RESET_SCORE,
  };
}

/**
 * If advancing from prevDate → nextDate crosses into a new Monday week,
 * archive the completed week’s scores and reset everyone to 0.
 */
export async function maybeResetScoresOnWeekRollover(prevDate, nextDate) {
  const prevMonday = getMondayUTC(prevDate);
  const nextMonday = getMondayUTC(nextDate);

  if (nextMonday.getTime() <= prevMonday.getTime()) {
    return { rolled: false };
  }

  const result = await archiveAndResetCleanPlateScores(prevMonday);
  return {
    rolled: true,
    ...result,
  };
}
