import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import User from '@/lib/models/User';
import WeeklyScoreSnapshot from '@/lib/models/WeeklyScoreSnapshot';
import SystemState from '@/lib/models/SystemState';
import { authOptions } from '@/lib/auth';
import { requireRoles } from '@/lib/authorization';
import {
  getMondayUTC,
  formatISODate,
  weekLabel,
  weekRangeLabel,
} from '@/lib/weekUtils';

const WINGS = ['A-Wing', 'B-Wing', 'C-Wing', 'D-Wing'];

/**
 * GET /api/vote/weekly-contest?weeks=4
 * Clean Plate Score history — current live week + archived past weeks.
 * Meal taste ratings are separate and do not reset.
 */
export async function GET(req) {
  try {
    await dbConnect();

    const { response } = await requireRoles(['ADMIN', 'WARDEN', 'STUDENT']);
    if (response) return response;

    const { searchParams } = new URL(req.url);
    let weeks = parseInt(searchParams.get('weeks') || '4', 10);
    if (isNaN(weeks) || weeks < 1) weeks = 4;
    if (weeks > 8) weeks = 8;

    let state = await SystemState.findOne();
    if (!state) {
      state = await SystemState.create({});
    }

    const currentMonday = getMondayUTC(state.simulatedDate);
    const weekEndExclusive = new Date(currentMonday);
    weekEndExclusive.setUTCDate(weekEndExclusive.getUTCDate() + 7);

    // Live scores for the current contest week
    const students = await User.find({ role: 'STUDENT' })
      .select('name wing cleanPlateScore')
      .lean();

    const liveWings = WINGS.map((wing) => {
      const list = students.filter((u) => u.wing === wing);
      const count = list.length;
      const sum = list.reduce((s, u) => s + (u.cleanPlateScore ?? 0), 0);
      return {
        wing,
        avgScore: count > 0 ? Math.round(sum / count) : 0,
        studentCount: count,
      };
    }).sort((a, b) => b.avgScore - a.avgScore);

    const liveHostelAvg =
      students.length > 0
        ? Math.round(
            students.reduce((s, u) => s + (u.cleanPlateScore ?? 0), 0) /
              students.length
          )
        : 0;

    const currentWeek = {
      weekStart: formatISODate(currentMonday),
      weekEnd: formatISODate(
        new Date(weekEndExclusive.getTime() - 24 * 60 * 60 * 1000)
      ),
      rangeLabel: weekRangeLabel(currentMonday, weekEndExclusive),
      label: 'Current Week',
      isCurrent: true,
      overall: {
        avgScore: liveHostelAvg,
        studentCount: students.length,
      },
      byWing: liveWings,
      topStudents: [...students]
        .sort((a, b) => (b.cleanPlateScore ?? 0) - (a.cleanPlateScore ?? 0))
        .slice(0, 5)
        .map((u) => ({
          name: u.name,
          wing: u.wing,
          cleanPlateScore: u.cleanPlateScore ?? 0,
        })),
    };

    // Archived weeks (previous Sundays → Monday rollovers)
    const snapshots = await WeeklyScoreSnapshot.find({})
      .sort({ weekStartDate: -1 })
      .limit(weeks - 1)
      .lean();

    const pastWeeks = snapshots.map((snap) => {
      const ws = new Date(snap.weekStartDate);
      const weExclusive = new Date(ws);
      weExclusive.setUTCDate(weExclusive.getUTCDate() + 7);
      return {
        weekStart: formatISODate(ws),
        weekEnd: formatISODate(
          snap.weekEndDate
            ? new Date(snap.weekEndDate)
            : new Date(weExclusive.getTime() - 24 * 60 * 60 * 1000)
        ),
        rangeLabel: weekRangeLabel(ws, weExclusive),
        label: weekLabel(ws, currentMonday),
        isCurrent: false,
        overall: {
          avgScore: snap.hostelAvg ?? 0,
          studentCount: snap.studentCount ?? 0,
        },
        byWing: (snap.wings || [])
          .map((w) => ({
            wing: w.wing,
            avgScore: w.avgScore ?? 0,
            studentCount: w.studentCount ?? 0,
          }))
          .sort((a, b) => b.avgScore - a.avgScore),
        topStudents: (snap.topStudents || []).slice(0, 5).map((t) => ({
          name: t.name,
          wing: t.wing,
          cleanPlateScore: t.cleanPlateScore ?? 0,
        })),
      };
    });

    const weeksOut = [currentWeek, ...pastWeeks].slice(0, weeks);

    return NextResponse.json({
      success: true,
      currentWeekStart: formatISODate(currentMonday),
      simulatedDate: formatISODate(new Date(state.simulatedDate)),
      contestRules:
        'Clean Plate Score starts at 0 every Monday, fills through the week (cap 100). Previous week is archived. Meal taste ratings do not reset.',
      weeks: weeksOut,
    });
  } catch (error) {
    console.error('[API Weekly Contest GET] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
