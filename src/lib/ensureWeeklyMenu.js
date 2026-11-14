import { randomUUID } from 'node:crypto';
import Dish from '@/lib/models/Dish';
import WeeklyMenu from '@/lib/models/WeeklyMenu';
import WeeklyMenuInitialization from '@/lib/models/WeeklyMenuInitialization';
import { DISHES_CATALOG, PREMIUM_DISH_NAMES } from '@/lib/dishesCatalog';
import { formatISODate, getMondayUTC } from '@/lib/weekUtils';

const WEEKDAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];
const SLOTS = ['BREAKFAST', 'LUNCH', 'SNACKS', 'DINNER'];
const INIT_LOCK_LEASE_MS = 2 * 60 * 1000;
const INIT_LOCK_WAIT_MS = 15 * 1000;

/**
 * Ensure dish catalog exists in DB (upsert by name).
 */
export async function ensureDishCatalog() {
  for (const d of DISHES_CATALOG) {
    await Dish.findOneAndUpdate(
      { name: d.name },
      {
        name: d.name,
        category: d.category,
        isVeg: d.isVeg,
        image: d.image,
      },
      { upsert: true, returnDocument: 'after' }
    );
  }
  return Dish.find({});
}

function pickRotated(list, dayIndex, weekSalt, slotSalt) {
  if (!list.length) return null;
  // Offset by week so consecutive weeks don't clone the same Mon→Sun sequence
  const start = (weekSalt + slotSalt) % list.length;
  return list[(start + dayIndex) % list.length];
}

/**
 * Build a varied Mon–Sun menu for weekStart (Monday UTC).
 * Each day gets different Indian-heavy dishes; dinner includes Chinese options.
 * Premium dishes are excluded from the regular rotation.
 */
export async function buildWeeklyMenuAssignments(weekStartDate) {
  const weekStart = getMondayUTC(weekStartDate);
  weekStart.setUTCHours(0, 0, 0, 0);

  await ensureDishCatalog();

  const allDishes = await Dish.find({
    name: { $nin: PREMIUM_DISH_NAMES },
  });

  const byCat = {
    BREAKFAST: allDishes.filter((d) => d.category === 'BREAKFAST'),
    LUNCH: allDishes.filter((d) => d.category === 'LUNCH'),
    SNACKS: allDishes.filter((d) => d.category === 'SNACKS'),
    DINNER: allDishes.filter((d) => d.category === 'DINNER'),
  };

  // Fallback: any non-premium dish
  const any = allDishes.length ? allDishes : await Dish.find({});
  const weekSalt = Math.floor(weekStart.getTime() / (7 * 24 * 60 * 60 * 1000));

  const assignments = [];
  const usedNamesPerDay = {};

  WEEKDAYS.forEach((dayName, dayIndex) => {
    usedNamesPerDay[dayName] = new Set();
    SLOTS.forEach((slot, slotIndex) => {
      const pool = byCat[slot]?.length ? byCat[slot] : any;
      let dish = pickRotated(pool, dayIndex, weekSalt, slotIndex * 3 + 1);

      // Avoid duplicate dish name on the same day across slots
      let attempts = 0;
      while (
        dish &&
        usedNamesPerDay[dayName].has(dish.name) &&
        attempts < pool.length
      ) {
        dish = pool[(dayIndex + slotIndex + attempts + 1) % pool.length];
        attempts += 1;
      }
      if (dish) usedNamesPerDay[dayName].add(dish.name);

      if (dish) {
        assignments.push({
          weekStartDate: weekStart,
          dayOfWeek: dayName,
          mealType: slot,
          dish: dish._id,
          wing: 'ALL',
          isPremium: false,
        });
      }
    });
  });

  return { weekStart, assignments };
}

async function acquireInitializationLock(weekKey) {
  const owner = randomUUID();
  const startedAt = Date.now();
  while (Date.now() - startedAt < INIT_LOCK_WAIT_MS) {
    const now = new Date();
    try {
      const lock = await WeeklyMenuInitialization.findOneAndUpdate(
        {
          _id: weekKey,
          $or: [
            { leaseExpiresAt: { $exists: false } },
            { leaseExpiresAt: { $lte: now } },
          ],
        },
        {
          $set: {
            leaseOwner: owner,
            leaseExpiresAt: new Date(now.getTime() + INIT_LOCK_LEASE_MS),
          },
        },
        { upsert: true, returnDocument: 'after' }
      );
      if (lock?.leaseOwner === owner) return owner;
    } catch (error) {
      if (error?.code !== 11000) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Timed out waiting for the weekly menu initialization lock.');
}

export async function withWeeklyMenuLock(weekStartDate, callback) {
  const weekStart = getMondayUTC(weekStartDate);
  weekStart.setUTCHours(0, 0, 0, 0);
  const weekKey = formatISODate(weekStart);
  const owner = await acquireInitializationLock(weekKey);
  try {
    return await callback(weekStart);
  } finally {
    await WeeklyMenuInitialization.updateOne(
      { _id: weekKey, leaseOwner: owner },
      { $unset: { leaseOwner: 1 }, $set: { leaseExpiresAt: new Date() } }
    );
  }
}

/**
 * Create a default menu only when no menu rows exist for the week.
 * Existing published menus are never replaced for having limited variety.
 */
export async function ensureWeeklyMenu(weekStartDate) {
  return withWeeklyMenuLock(weekStartDate, async (weekStart) => {
    const existing = await WeeklyMenu.exists({ weekStartDate: weekStart });
    if (existing) return false;

    const { assignments } = await buildWeeklyMenuAssignments(weekStart);
    if (!assignments.length) return false;

    await WeeklyMenu.insertMany(assignments);
    return true;
  });
}
