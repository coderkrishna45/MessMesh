import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import User from '@/lib/models/User';
import WeeklyPoll from '@/lib/models/WeeklyPoll';
import WasteLog from '@/lib/models/WasteLog';
import MealRating from '@/lib/models/MealRating';
import { requireRoles } from '@/lib/authorization';
import { getApplicationTime, scoreForApplicationWeek } from '@/lib/applicationTime';
import { getMondayUTC } from '@/lib/weekUtils';

// GET: Hostel-wide stats, wing breakdowns, dish rankings, and waste forecast
export async function GET() {
  try {
    await dbConnect();

    const { user, response } = await requireRoles(['ADMIN', 'WARDEN']);
    if (response) return response;
    const studentsFilter = { role: 'STUDENT', active: { $ne: false } };
    const wasteFilter = {};
    if (user.role === 'WARDEN') {
      studentsFilter.wing = user.wing;
      wasteFilter.wing = user.wing;
    }
    const wingStudents = await User.find(studentsFilter).select('_id').lean();
    const studentIds = wingStudents.map((student) => student._id);
    const totalStudents = studentIds.length;
    const totalVotes = await WeeklyPoll.aggregate([
      { $match: { status: 'ACTIVE' } },
      { $unwind: '$dishes' },
      ...(user.role === 'WARDEN'
        ? [
            {
              $project: {
                wingVotes: {
                  $size: {
                    $setIntersection: [
                      { $ifNull: ['$dishes.voters', []] },
                      studentIds,
                    ],
                  },
                },
              },
            },
            { $group: { _id: null, total: { $sum: '$wingVotes' } } },
          ]
        : [{ $group: { _id: null, total: { $sum: '$dishes.votes' } } }]),
    ]);
    const totalVotesCount = totalVotes.length > 0 ? totalVotes[0].total : 0;

    const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const applicationTime = await getApplicationTime();
    const dayOfWeekName = weekdays[applicationTime.getUTCDay()];

    const weekStart = getMondayUTC(applicationTime);
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
    weekEnd.setUTCHours(23, 59, 59, 999);

    const formatISODate = (d) => d.toISOString().split('T')[0];
    const weekRange = {
      start: formatISODate(weekStart),
      end: formatISODate(weekEnd),
      label: `${formatISODate(weekStart)} → ${formatISODate(weekEnd)}`,
      currentDate: formatISODate(applicationTime),
      dayOfWeekName,
    };

    const allLogs = await WasteLog.find(wasteFilter);
    const totalLogs = allLogs.length;

    const totalWasteSum = allLogs.reduce((acc, curr) => acc + (curr.wasteLevel || 0), 0);
    const avgWasteIndex = totalLogs > 0 ? parseFloat((totalWasteSum / totalLogs).toFixed(1)) : 0;

    const allStudents = await User.find(studentsFilter);
    const totalStudentsCount = allStudents.length;
    const totalScoresSum = allStudents.reduce(
      (acc, student) => acc + scoreForApplicationWeek(student, applicationTime),
      0
    );
    const avgScore = totalStudentsCount > 0 ? Math.round(totalScoresSum / totalStudentsCount) : 0;

    const wingWasteRaw = await WasteLog.aggregate([
      { $match: wasteFilter },
      {
        $group: {
          _id: '$wing',
          avgWaste: { $avg: '$wasteLevel' },
          totalLogs: { $sum: 1 },
        },
      },
    ]);

    const wingsList =
      user.role === 'WARDEN'
        ? [user.wing]
        : ['A-Wing', 'B-Wing', 'C-Wing', 'D-Wing'];
    const wingWaste = wingsList.map((w) => {
      const match = wingWasteRaw.find((r) => r._id === w);
      return {
        wing: w,
        avgWaste: match ? parseFloat(match.avgWaste.toFixed(1)) : 0,
        totalLogs: match ? match.totalLogs : 0,
      };
    });

    const wingScores = wingsList
      .map((wing) => {
        const students = allStudents.filter((student) => student.wing === wing);
        const total = students.reduce(
          (sum, student) => sum + scoreForApplicationWeek(student, applicationTime),
          0
        );
        return {
          wing,
          avgScore: students.length ? Math.round(total / students.length) : 0,
          studentCount: students.length,
        };
      })
      .sort((a, b) => b.avgScore - a.avgScore);

    // Daily waste trends: prefer current simulated week, else last 7 day-buckets
    const weekLogsAgg = await WasteLog.aggregate([
      {
        $match: {
          ...wasteFilter,
          date: { $gte: weekStart, $lte: weekEnd },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
          avgWaste: { $avg: '$wasteLevel' },
          logCount: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const dailyHistoryRaw =
      weekLogsAgg.length > 0
        ? weekLogsAgg
        : await WasteLog.aggregate([
            { $match: wasteFilter },
            {
              $group: {
                _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
                avgWaste: { $avg: '$wasteLevel' },
                logCount: { $sum: 1 },
              },
            },
            { $sort: { _id: 1 } },
            { $limit: 7 },
          ]);

    const dailyHistory = dailyHistoryRaw.map((item) => {
      const dateObj = new Date(item._id);
      const dayLabel = weekdays[dateObj.getUTCDay()].substring(0, 3);
      return {
        date: item._id,
        dayLabel,
        avgWaste: item.avgWaste ? parseFloat(item.avgWaste.toFixed(1)) : 0,
        logCount: item.logCount,
      };
    });

    const ratingFilter =
      user.role === 'WARDEN' ? { user: { $in: studentIds } } : {};
    const dishRatingsRaw = await MealRating.aggregate([
      { $match: ratingFilter },
      {
        $group: {
          _id: '$dish',
          avgRating: { $avg: '$rating' },
          ratingCount: { $sum: 1 },
        },
      },
      { $sort: { avgRating: -1 } },
      {
        $lookup: {
          from: 'dishes',
          localField: '_id',
          foreignField: '_id',
          as: 'dishInfo',
        },
      },
      { $unwind: { path: '$dishInfo', preserveNullAndEmptyArrays: true } },
    ]);

    const dishRankings = dishRatingsRaw.map((d) => ({
      dishId: d._id?.toString?.() || String(d._id),
      name: d.dishInfo?.name || 'Unknown Dish',
      category: d.dishInfo?.category || '—',
      avgRating: d.avgRating ? parseFloat(d.avgRating.toFixed(2)) : 0,
      ratingCount: d.ratingCount || 0,
    }));

    const topDishes = dishRankings.slice(0, 5);
    const bottomDishes = [...dishRankings].sort((a, b) => a.avgRating - b.avgRating).slice(0, 5);

    // Portion forecast: weighted moving average of daily waste (recent days weigh more)
    let tomorrowForecast = 3.0;
    let recommendation = 'Portion recommendations loaded.';
    let riskLevel = 'MODERATE';

    if (dailyHistoryRaw.length > 0) {
      let weightedSum = 0;
      let weightTotal = 0;

      dailyHistoryRaw.forEach((item, index) => {
        const weight = index + 1;
        weightedSum += (item.avgWaste || 0) * weight;
        weightTotal += weight;
      });

      tomorrowForecast = parseFloat((weightedSum / weightTotal).toFixed(2));

      if (tomorrowForecast >= 3.5) {
        riskLevel = 'HIGH';
        recommendation =
          'High leftovers expected: suggest cutting portion sizes by 15% to minimize waste.';
      } else if (tomorrowForecast <= 2.2) {
        riskLevel = 'LOW';
        recommendation =
          'Clean plate trend: high meal consumption. Standard portions recommended.';
      } else {
        riskLevel = 'MODERATE';
        recommendation =
          'Stable waste trend: average leftovers expected. Maintain standard serving sizes.';
      }
    }

    const weekAvgWaste =
      dailyHistory.length > 0
        ? parseFloat(
            (
              dailyHistory.reduce((s, d) => s + d.avgWaste, 0) / dailyHistory.length
            ).toFixed(2)
          )
        : avgWasteIndex;

    const wasteTrend = {
      weekAvgWaste,
      totalWeekLogs: dailyHistory.reduce((s, d) => s + (d.logCount || 0), 0),
      daysTracked: dailyHistory.length,
      peakDay: dailyHistory.reduce(
        (best, d) => (!best || d.avgWaste > best.avgWaste ? d : best),
        null
      ),
      bestDay: dailyHistory.reduce(
        (best, d) => (!best || d.avgWaste < best.avgWaste ? d : best),
        null
      ),
    };

    return NextResponse.json({
      success: true,
      scope: user.role === 'WARDEN' ? user.wing : 'HOSTEL',
      stats: {
        totalStudents,
        totalVotes: totalVotesCount,
        totalLogs,
        avgScore,
        avgWasteIndex,
      },
      wingWaste,
      wingScores,
      dailyHistory,
      dayOfWeekName,
      weekRange,
      topDishes,
      bottomDishes,
      wasteTrend,
      forecast: {
        tomorrowForecast,
        recommendation,
        riskLevel,
        confidenceInterval: '±0.25',
      },
    });
  } catch (error) {
    console.error('[API Stats GET] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
