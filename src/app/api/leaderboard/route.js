import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import User from '@/lib/models/User';

// GET /api/leaderboard — wing and individual Clean Plate Score standings
export async function GET(req) {
  try {
    await dbConnect();

    const students = await User.find({ role: 'STUDENT', active: { $ne: false } })
      .select('name wing cleanPlateScore')
      .exec();

    const wingGroups = {};
    students.forEach((student) => {
      const wingName = student.wing || 'Unknown';
      if (!wingGroups[wingName]) {
        wingGroups[wingName] = {
          wing: wingName,
          totalScore: 0,
          studentCount: 0,
        };
      }
      wingGroups[wingName].totalScore += student.cleanPlateScore ?? 0;
      wingGroups[wingName].studentCount += 1;
    });

    const wingLeaderboard = Object.values(wingGroups).map((group) => ({
      wing: group.wing,
      avgScore: Math.round(group.totalScore / group.studentCount),
      studentCount: group.studentCount,
    }));

    wingLeaderboard.sort((a, b) => b.avgScore - a.avgScore);

    const studentLeaderboard = [...students];
    studentLeaderboard.sort((a, b) => (b.cleanPlateScore || 0) - (a.cleanPlateScore || 0));

    return NextResponse.json({
      success: true,
      wingLeaderboard,
      studentLeaderboard: studentLeaderboard.map((student) => ({
        id: student._id,
        name: student.name,
        wing: student.wing,
        cleanPlateScore: student.cleanPlateScore || 0,
      })),
    });
  } catch (error) {
    console.error('[API Leaderboard GET] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
