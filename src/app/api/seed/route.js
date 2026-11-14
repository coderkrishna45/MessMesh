import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import User from '@/lib/models/User';
import Dish from '@/lib/models/Dish';
import WeeklyPoll from '@/lib/models/WeeklyPoll';
import WeeklyMenu from '@/lib/models/WeeklyMenu';
import WasteLog from '@/lib/models/WasteLog';
import MealRating from '@/lib/models/MealRating';
import SystemState from '@/lib/models/SystemState';
import WeeklyScoreSnapshot from '@/lib/models/WeeklyScoreSnapshot';
import bcrypt from 'bcryptjs';
import { DISHES_CATALOG } from '@/lib/dishesCatalog';
import { buildWeeklyMenuAssignments } from '@/lib/ensureWeeklyMenu';

/**
 * Destructive demo seeder — wipes ALL collections then reloads sample data.
 *
 * Legacy destructive seeding is available only in explicitly unlocked non-production
 * environments. Public demo deployments must use the dedicated demo reset command.
 */
function isSeedAllowed(req) {
  const allowFlag = process.env.ALLOW_DB_SEED === 'true';
  const expectedSecret = process.env.SEED_SECRET;
  const providedSecret =
    req.headers.get('x-seed-secret') ||
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');

  if (process.env.DEMO_MODE === 'true') {
    return {
      ok: false,
      status: 403,
      error: 'The legacy destructive seed endpoint is disabled in demo mode. Use the dedicated demo reset command.',
    };
  }
  if (process.env.NODE_ENV === 'production') {
    return {
      ok: false,
      status: 403,
      error: 'The legacy destructive seed endpoint is disabled in production.',
    };
  }
  if (!allowFlag || !expectedSecret) {
    return {
      ok: false,
      status: 403,
      error: 'Legacy destructive seeding is disabled. Set ALLOW_DB_SEED=true and SEED_SECRET only for an explicitly authorized one-time operation.',
    };
  }

  if (providedSecret !== expectedSecret) {
    return {
      ok: false,
      status: 401,
      error: 'Missing or invalid x-seed-secret header.',
    };
  }

  return { ok: true };
}

export async function GET(req) {
  try {
    const gate = isSeedAllowed(req);
    if (!gate.ok) {
      return NextResponse.json(
        { success: false, error: gate.error },
        { status: gate.status }
      );
    }

    await dbConnect();

    await User.deleteMany({});
    await Dish.deleteMany({});
    await WeeklyPoll.deleteMany({});
    await WeeklyMenu.deleteMany({});
    await WasteLog.deleteMany({});
    await MealRating.deleteMany({});
    await SystemState.deleteMany({});
    await WeeklyScoreSnapshot.deleteMany({});

    await SystemState.create({});

    const hashedWardenPassword = await bcrypt.hash('warden123', 10);
    const hashedStudentPassword = await bcrypt.hash('student123', 10);

    const users = await User.create([
      { name: 'Warden Susan', email: 'warden1@messmesh.com', password: hashedWardenPassword, role: 'WARDEN', wing: 'A-Wing' },
      { name: 'Warden Thomas', email: 'warden2@messmesh.com', password: hashedWardenPassword, role: 'WARDEN', wing: 'B-Wing' },
      { name: 'Warden Michael', email: 'warden3@messmesh.com', password: hashedWardenPassword, role: 'WARDEN', wing: 'C-Wing' },
      { name: 'Warden Sarah', email: 'warden4@messmesh.com', password: hashedWardenPassword, role: 'WARDEN', wing: 'D-Wing' },
      { name: 'Alice Smith', email: 'student1@messmesh.com', password: hashedStudentPassword, role: 'STUDENT', wing: 'A-Wing', cleanPlateScore: 0, rollNumber: '1001', needsPasswordChange: false },
      { name: 'Bob Jones', email: 'student2@messmesh.com', password: hashedStudentPassword, role: 'STUDENT', wing: 'B-Wing', cleanPlateScore: 0, rollNumber: '1002', needsPasswordChange: false },
      { name: 'Charlie Brown', email: 'student3@messmesh.com', password: hashedStudentPassword, role: 'STUDENT', wing: 'C-Wing', cleanPlateScore: 0, rollNumber: '1003', needsPasswordChange: false },
      { name: 'David Miller', email: 'student4@messmesh.com', password: hashedStudentPassword, role: 'STUDENT', wing: 'D-Wing', cleanPlateScore: 0, rollNumber: '1004', needsPasswordChange: false },
      { name: 'Emma Watson', email: 'student5@messmesh.com', password: hashedStudentPassword, role: 'STUDENT', wing: 'A-Wing', cleanPlateScore: 0, rollNumber: '1005', needsPasswordChange: false },
      { name: 'Frank Miller', email: 'student6@messmesh.com', password: hashedStudentPassword, role: 'STUDENT', wing: 'B-Wing', cleanPlateScore: 0, rollNumber: '1006', needsPasswordChange: false },
      { name: 'Grace Hopper', email: 'student7@messmesh.com', password: hashedStudentPassword, role: 'STUDENT', wing: 'C-Wing', cleanPlateScore: 0, rollNumber: '1007', needsPasswordChange: false },
      { name: 'Henry Ford', email: 'student8@messmesh.com', password: hashedStudentPassword, role: 'STUDENT', wing: 'D-Wing', cleanPlateScore: 0, rollNumber: '1008', needsPasswordChange: false },
      { name: 'Ivy League', email: 'student9@messmesh.com', password: hashedStudentPassword, role: 'STUDENT', wing: 'A-Wing', cleanPlateScore: 0, rollNumber: '1009', needsPasswordChange: false },
      { name: 'Jack Sparrow', email: 'student10@messmesh.com', password: hashedStudentPassword, role: 'STUDENT', wing: 'B-Wing', cleanPlateScore: 0, rollNumber: '1010', needsPasswordChange: false },
    ]);

    const createdDishes = await Dish.create(DISHES_CATALOG);

    // weekStartDate = Monday 13 Jul 2026 (UTC), aligned with simulated Wednesday 15 Jul 2026
    const monday = new Date(Date.UTC(2026, 6, 13, 0, 0, 0, 0));

    const pollDishes = createdDishes.map((dish) => ({
      dish: dish._id,
      votes: 0,
      voters: [],
    }));

    const weeklyPoll = await WeeklyPoll.create({
      weekStartDate: monday,
      dishes: pollDishes,
      status: 'ACTIVE',
    });

    // Varied Mon–Sun Indian (+ Chinese dinner) menu for the seed week
    const { assignments: menuAssignments } = await buildWeeklyMenuAssignments(monday);
    await WeeklyMenu.create(menuAssignments);

    // Sample WasteLogs / ratings for Mon–Tue of the seed week (charts / demos)
    const students = users.filter(u => u.role === 'STUDENT');
    const logs = [];
    const ratings = [];

    const dateOfLogs = [
      new Date(Date.UTC(2026, 6, 13, 0, 0, 0, 0)), // Monday, July 13
      new Date(Date.UTC(2026, 6, 14, 0, 0, 0, 0)), // Tuesday, July 14
    ];

    students.forEach((student, index) => {
      const datesToLog = dateOfLogs.slice(0, 2 + (index % 2));
      
      datesToLog.forEach(date => {
        const randomDish1 = createdDishes[index % createdDishes.length];
        const randomDish2 = createdDishes[(index + 3) % createdDishes.length];
        
        const wasteLevel = 1 + ((index + date.getDate()) % 5);

        logs.push({
          user: student._id,
          dish: randomDish1._id,
          wasteLevel,
          imageUrl: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500',
          wing: student.wing,
          date: date
        });

        const rating = 1 + ((index + date.getDate() + 2) % 5);
        ratings.push({
          user: student._id,
          dish: randomDish2._id,
          date: date,
          rating
        });
      });
    });

    await WasteLog.create(logs);
    await MealRating.create(ratings);

    return NextResponse.json({
      success: true,
      message: 'Database re-seeded with realistic students, wings, ratings, and logs!',
      studentsSeeded: students.length,
      wardensSeeded: users.length - students.length,
      dishesCount: createdDishes.length,
      logsSeeded: logs.length,
      ratingsSeeded: ratings.length,
      pollCreatedFor: monday.toDateString(),
    });
  } catch (error) {
    console.error('Seeding error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
