import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import User from '@/lib/models/User';
import Dish from '@/lib/models/Dish';
import WeeklyPoll from '@/lib/models/WeeklyPoll';
import WeeklyMenu from '@/lib/models/WeeklyMenu';
import WasteLog from '@/lib/models/WasteLog';
import MealRating from '@/lib/models/MealRating';
import SystemState from '@/lib/models/SystemState';
import bcrypt from 'bcryptjs';

const dishesData = [
  { name: 'Aloo Paratha', category: 'BREAKFAST', isVeg: true, image: 'https://images.unsplash.com/photo-1601050690597-df056fb4ce78?w=500&auto=format&fit=crop&q=60' },
  { name: 'Masala Dosa', category: 'BREAKFAST', isVeg: true, image: 'https://images.unsplash.com/photo-1668236543090-82eba5ee5976?w=500&auto=format&fit=crop&q=60' },
  { name: 'Idli Sambhar', category: 'BREAKFAST', isVeg: true, image: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=500&auto=format&fit=crop&q=60' },
  { name: 'Paneer Butter Masala', category: 'LUNCH', isVeg: true, image: 'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=500&auto=format&fit=crop&q=60' },
  { name: 'Chicken Biryani', category: 'LUNCH', isVeg: false, image: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=500&auto=format&fit=crop&q=60' },
  { name: 'Dal Makhani', category: 'DINNER', isVeg: true, image: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=500&auto=format&fit=crop&q=60' },
  { name: 'Butter Chicken', category: 'DINNER', isVeg: false, image: 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=500&auto=format&fit=crop&q=60' },
  { name: 'Veg Hakka Noodles', category: 'SNACKS', isVeg: true, image: 'https://images.unsplash.com/photo-1585032226651-759b368d7246?w=500&auto=format&fit=crop&q=60' },
  { name: 'Samosa', category: 'SNACKS', isVeg: true, image: 'https://images.unsplash.com/photo-1601050690597-df056fb4ce78?w=500&auto=format&fit=crop&q=60' },
  { name: 'Grilled Cheese Sandwich', category: 'SNACKS', isVeg: true, image: 'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=500&auto=format&fit=crop&q=60' },
  { name: 'Sunday Premium Paneer Feast', category: 'LUNCH', isVeg: true, image: 'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=500&auto=format&fit=crop&q=60' },
  { name: 'Sunday Premium Chicken Feast', category: 'DINNER', isVeg: false, image: 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=500&auto=format&fit=crop&q=60' },
];

/**
 * Destructive demo seeder — wipes ALL collections then reloads sample data.
 *
 * Safety (production):
 * - Blocked when NODE_ENV === 'production' unless ALLOW_DB_SEED === 'true'
 * - Always requires header: x-seed-secret matching SEED_SECRET (or NEXTAUTH_SECRET)
 *
 * Dev without SEED_SECRET: still allowed (local convenience).
 * Prod: set ALLOW_DB_SEED=true only temporarily, pass the secret, then turn it off.
 */
function isSeedAllowed(req) {
  const isProd = process.env.NODE_ENV === 'production';
  const allowFlag = process.env.ALLOW_DB_SEED === 'true';
  const expectedSecret = process.env.SEED_SECRET || process.env.NEXTAUTH_SECRET;
  const providedSecret =
    req.headers.get('x-seed-secret') ||
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');

  if (isProd && !allowFlag) {
    return {
      ok: false,
      status: 403,
      error:
        'Seeding is disabled in production. Set ALLOW_DB_SEED=true and pass x-seed-secret only for a one-time setup.',
    };
  }

  // In production (even when ALLOW_DB_SEED=true), secret is mandatory
  if (isProd) {
    if (!expectedSecret || providedSecret !== expectedSecret) {
      return {
        ok: false,
        status: 401,
        error: 'Missing or invalid x-seed-secret header.',
      };
    }
    return { ok: true };
  }

  // Development: if SEED_SECRET is set, require it; otherwise allow open seed
  if (process.env.SEED_SECRET && providedSecret !== process.env.SEED_SECRET) {
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

    await SystemState.create({});

    const hashedWardenPassword = await bcrypt.hash('warden123', 10);
    const hashedStudentPassword = await bcrypt.hash('student123', 10);

    const users = await User.create([
      { name: 'Warden Susan', email: 'warden1@messmesh.com', password: hashedWardenPassword, role: 'WARDEN', wing: 'A-Wing' },
      { name: 'Warden Thomas', email: 'warden2@messmesh.com', password: hashedWardenPassword, role: 'WARDEN', wing: 'B-Wing' },
      { name: 'Warden Michael', email: 'warden3@messmesh.com', password: hashedWardenPassword, role: 'WARDEN', wing: 'C-Wing' },
      { name: 'Warden Sarah', email: 'warden4@messmesh.com', password: hashedWardenPassword, role: 'WARDEN', wing: 'D-Wing' },
      { name: 'Alice Smith', email: 'student1@messmesh.com', password: hashedStudentPassword, role: 'STUDENT', wing: 'A-Wing', cleanPlateScore: 95, rollNumber: '1001', needsPasswordChange: false },
      { name: 'Bob Jones', email: 'student2@messmesh.com', password: hashedStudentPassword, role: 'STUDENT', wing: 'B-Wing', cleanPlateScore: 78, rollNumber: '1002', needsPasswordChange: false },
      { name: 'Charlie Brown', email: 'student3@messmesh.com', password: hashedStudentPassword, role: 'STUDENT', wing: 'C-Wing', cleanPlateScore: 100, rollNumber: '1003', needsPasswordChange: false },
      { name: 'David Miller', email: 'student4@messmesh.com', password: hashedStudentPassword, role: 'STUDENT', wing: 'D-Wing', cleanPlateScore: 62, rollNumber: '1004', needsPasswordChange: false },
      { name: 'Emma Watson', email: 'student5@messmesh.com', password: hashedStudentPassword, role: 'STUDENT', wing: 'A-Wing', cleanPlateScore: 88, rollNumber: '1005', needsPasswordChange: false },
      { name: 'Frank Miller', email: 'student6@messmesh.com', password: hashedStudentPassword, role: 'STUDENT', wing: 'B-Wing', cleanPlateScore: 71, rollNumber: '1006', needsPasswordChange: false },
      { name: 'Grace Hopper', email: 'student7@messmesh.com', password: hashedStudentPassword, role: 'STUDENT', wing: 'C-Wing', cleanPlateScore: 84, rollNumber: '1007', needsPasswordChange: false },
      { name: 'Henry Ford', email: 'student8@messmesh.com', password: hashedStudentPassword, role: 'STUDENT', wing: 'D-Wing', cleanPlateScore: 92, rollNumber: '1008', needsPasswordChange: false },
      { name: 'Ivy League', email: 'student9@messmesh.com', password: hashedStudentPassword, role: 'STUDENT', wing: 'A-Wing', cleanPlateScore: 80, rollNumber: '1009', needsPasswordChange: false },
      { name: 'Jack Sparrow', email: 'student10@messmesh.com', password: hashedStudentPassword, role: 'STUDENT', wing: 'B-Wing', cleanPlateScore: 55, rollNumber: '1010', needsPasswordChange: false },
    ]);

    const createdDishes = await Dish.create(dishesData);

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

    const menuAssignments = [];
    const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

    weekdays.forEach((dayName, index) => {
      const breakfastIndex = index % 3; 
      const lunchIndex = 3 + (index % 2); 
      const snacksIndex = 7 + (index % 3); 
      const dinnerIndex = 5 + (index % 2); 

      menuAssignments.push(
        { weekStartDate: monday, dayOfWeek: dayName, mealType: 'BREAKFAST', dish: createdDishes[breakfastIndex]._id },
        { weekStartDate: monday, dayOfWeek: dayName, mealType: 'LUNCH', dish: createdDishes[lunchIndex]._id },
        { weekStartDate: monday, dayOfWeek: dayName, mealType: 'SNACKS', dish: createdDishes[snacksIndex]._id },
        { weekStartDate: monday, dayOfWeek: dayName, mealType: 'DINNER', dish: createdDishes[dinnerIndex]._id }
      );
    });

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
