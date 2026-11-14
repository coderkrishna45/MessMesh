import { loadEnvConfig } from '@next/env';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { randomBytes } from 'node:crypto';
import { safeDemoDatabase } from '../src/lib/accessPolicy.js';

loadEnvConfig(process.cwd());

function databaseIdentity(uri) {
  try {
    const parsed = new URL(uri);
    const name = parsed.pathname.replace(/^\/+|\/+$/g, '').split('/')[0];
    return name ? `${parsed.host.toLowerCase()}/${name.toLowerCase()}` : null;
  } catch {
    return null;
  }
}

async function main() {
  if (
    process.env.DEMO_MODE !== 'true' ||
    process.env.DEMO_RESET_CONFIRM !== 'YES_DEMO_RESET'
  ) {
    throw new Error('Set DEMO_MODE=true and DEMO_RESET_CONFIRM=YES_DEMO_RESET to reset demo data.');
  }

  const demoUri = process.env.DEMO_MONGODB_URI;
  const demoDatabase = databaseIdentity(demoUri || '')?.split('/').pop();
  if (!safeDemoDatabase(process.env)) {
    throw new Error('Refusing to reset: DEMO_MONGODB_URI must name a distinct demo database.');
  }

  await mongoose.connect(demoUri, { bufferCommands: false });
  const [
    { default: User },
    { default: Dish },
    { default: WeeklyPoll },
    { default: WeeklyMenu },
    { default: WasteLog },
    { default: MealRating },
    { default: SystemState },
    { default: WeeklyScoreSnapshot },
    { default: AccountAudit },
    { default: AccountSetupToken },
    { default: RateLimitBucket },
    { DISHES_CATALOG },
  ] = await Promise.all([
    import('../src/lib/models/User.js'),
    import('../src/lib/models/Dish.js'),
    import('../src/lib/models/WeeklyPoll.js'),
    import('../src/lib/models/WeeklyMenu.js'),
    import('../src/lib/models/WasteLog.js'),
    import('../src/lib/models/MealRating.js'),
    import('../src/lib/models/SystemState.js'),
    import('../src/lib/models/WeeklyScoreSnapshot.js'),
    import('../src/lib/models/AccountAudit.js'),
    import('../src/lib/models/AccountSetupToken.js'),
    import('../src/lib/models/RateLimitBucket.js'),
    import('../src/lib/dishesCatalog.js'),
  ]);

  await Promise.all([
    User.deleteMany({}),
    Dish.deleteMany({}),
    WeeklyPoll.deleteMany({}),
    WeeklyMenu.deleteMany({}),
    WasteLog.deleteMany({}),
    MealRating.deleteMany({}),
    SystemState.deleteMany({}),
    WeeklyScoreSnapshot.deleteMany({}),
    AccountAudit.deleteMany({}),
    AccountSetupToken.deleteMany({}),
    RateLimitBucket.deleteMany({}),
  ]);

  const passwordHash = await bcrypt.hash(randomBytes(32).toString('base64url'), 12);
  const entryAccounts = await User.create([
    {
      name: 'Fictional Demo Administrator',
      email: 'admin@demo.messmesh.invalid',
      role: 'ADMIN',
      wing: 'ALL',
      password: passwordHash,
      isDemoAccount: true,
      isDemoData: true,
    },
    {
      name: 'Fictional Demo Warden',
      email: 'warden@demo.messmesh.invalid',
      role: 'WARDEN',
      wing: 'A-Wing',
      password: passwordHash,
      isDemoAccount: true,
      isDemoData: true,
    },
    {
      name: 'Fictional Demo Student',
      email: 'student@demo.messmesh.invalid',
      role: 'STUDENT',
      wing: 'A-Wing',
      rollNumber: 'DEMO-000',
      password: passwordHash,
      isDemoAccount: true,
      isDemoData: true,
    },
  ]);
  const sampleStudents = await User.create(
    Array.from({ length: 8 }, (_, index) => ({
      name: `Fictional Student ${String(index + 1).padStart(2, '0')}`,
      email: `student${index + 1}@demo.messmesh.invalid`,
      rollNumber: `DEMO-${String(index + 1).padStart(3, '0')}`,
      role: 'STUDENT',
      wing: ['A-Wing', 'B-Wing', 'C-Wing', 'D-Wing'][index % 4],
      password: passwordHash,
      cleanPlateScore: 60 + (index * 5) % 40,
      isDemoData: true,
    }))
  );
  await SystemState.create({
    simulatedDate: new Date(Date.UTC(2026, 6, 15)),
  });

  const dishes = await Dish.create(DISHES_CATALOG);
  const byCategory = {
    BREAKFAST: dishes.filter((dish) => dish.category === 'BREAKFAST'),
    LUNCH: dishes.filter((dish) => dish.category === 'LUNCH'),
    SNACKS: dishes.filter((dish) => dish.category === 'SNACKS'),
    DINNER: dishes.filter((dish) => dish.category === 'DINNER'),
  };
  const monday = new Date(Date.UTC(2026, 6, 13));
  const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const mealTypes = ['BREAKFAST', 'LUNCH', 'SNACKS', 'DINNER'];
  const menu = [];
  weekdays.forEach((dayOfWeek, dayIndex) => {
    mealTypes.forEach((mealType, mealIndex) => {
      const pool = byCategory[mealType];
      menu.push({
        weekStartDate: monday,
        dayOfWeek,
        mealType,
        dish: pool[(dayIndex + mealIndex) % pool.length]._id,
        wing: 'ALL',
      });
    });
  });
  await WeeklyMenu.create(menu);
  await WeeklyPoll.create({
    weekStartDate: monday,
    status: 'ACTIVE',
    dishes: dishes.map((dish) => ({ dish: dish._id, votes: 0, voters: [] })),
  });

  const activity = sampleStudents.map((student, index) => ({
    user: student._id,
    dish: dishes[index % dishes.length]._id,
    date: new Date(Date.UTC(2026, 6, 14)),
    wasteLevel: 1 + (index % 5),
    imageUrl: '',
    wing: student.wing,
  }));
  await WasteLog.create(activity);
  await MealRating.create(
    activity.map((entry, index) => ({
      user: entry.user,
      dish: dishes[(index + 3) % dishes.length]._id,
      date: entry.date,
      rating: 1 + (index % 5),
    }))
  );

  console.log(`Demo database ${demoDatabase} reset with fictional role accounts and sample activity.`);
  console.log(`Protected demo entry accounts initialized: ${entryAccounts.length}.`);
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
  });
