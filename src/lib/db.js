import mongoose from 'mongoose';
import './models/User.js';
import './models/Dish.js';
import './models/WeeklyPoll.js';
import './models/WasteLog.js';
import './models/WeeklyMenu.js';
import './models/MealRating.js';
import './models/SystemState.js';
import './models/WeeklyScoreSnapshot.js';
import { safeDemoDatabase } from './accessPolicy.js';

if (process.env.DEMO_MODE === 'true') {
  if (!safeDemoDatabase(process.env)) {
    throw new Error(
      'Demo mode requires a dedicated demo-named DEMO_MONGODB_URI and a distinct REAL_DATABASE_NAME.'
    );
  }
}

const MONGODB_URI =
  process.env.DEMO_MODE === 'true'
    ? process.env.DEMO_MONGODB_URI
    : process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error(
    'Please define the MONGODB_URI environment variable inside .env.local'
  );
}

/**
 * Global is used here to maintain a cached connection across hot reloads
 * in development. This prevents connections growing exponentially
 * during API Route usage.
 */
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

async function dbConnect() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
    };

    cached.promise = mongoose.connect(MONGODB_URI, opts).then((mongooseInstance) => {
      return mongooseInstance;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

export default dbConnect;
