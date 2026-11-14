import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import User from '@/lib/models/User';
import { getApplicationTime, scoreForApplicationWeek } from '@/lib/applicationTime';

// GET /api/leaderboard — wing and individual Clean Plate Score standings
export async function GET() {
  try {
    await dbConnect();
    const applicationTime = await getApplicationTime();

    const students = await User.find({ role: 'STUDENT', active: { $ne: false } })
      .select('name wing cleanPlateScore cleanPlateScoreWeekStart')
      .exec();
    const scoredStudents = students.map((student) => ({
      student,
      cleanPlateScore: scoreForApplicationWeek(student, applicationTime),
    }));

    const wingGroups = {};
    scoredStudents.forEach(({ student, cleanPlateScore }) => {
      const wingName = student.wing || 'Unknown';
      if (!wingGroups[wingName]) {
        wingGroups[wingName] = {
          wing: wingName,
          totalScore: 0,
          studentCount: 0,
        };
      }
      wingGroups[wingName].totalScore += cleanPlateScore;
      wingGroups[wingName].studentCount += 1;
    });

    const wingLeaderboard = Object.values(wingGroups).map((group) => ({
      wing: group.wing,
      avgScore: Math.round(group.totalScore / group.studentCount),
      studentCount: group.studentCount,
    }));

    wingLeaderboard.sort((a, b) => b.avgScore - a.avgScore);

    const studentLeaderboard = [...scoredStudents];
    studentLeaderboard.sort((a, b) => b.cleanPlateScore - a.cleanPlateScore);

    return NextResponse.json({
      success: true,
      wingLeaderboard,
      studentLeaderboard: studentLeaderboard.map(({ student, cleanPlateScore }) => ({
        id: student._id,
        name: student.name,
        wing: student.wing,
        cleanPlateScore,
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
