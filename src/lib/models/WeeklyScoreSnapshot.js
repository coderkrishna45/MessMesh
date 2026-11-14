import mongoose from 'mongoose';

/**
 * Archived Clean Plate Scores at the end of each contest week (Sunday → Monday rollover).
 * Meal taste ratings are never stored here — they stay permanent in MealRating.
 */
const WeeklyScoreSnapshotSchema = new mongoose.Schema(
  {
    weekStartDate: {
      type: Date,
      required: true,
      unique: true,
    },
    weekEndDate: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ['PENDING', 'COMPLETED'],
      default: 'COMPLETED',
    },
    hostelAvg: {
      type: Number,
      default: 100,
    },
    studentCount: {
      type: Number,
      default: 0,
    },
    wings: [
      {
        wing: { type: String, required: true },
        avgScore: { type: Number, default: 100 },
        studentCount: { type: Number, default: 0 },
      },
    ],
    topStudents: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        name: String,
        wing: String,
        cleanPlateScore: Number,
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.models.WeeklyScoreSnapshot ||
  mongoose.model('WeeklyScoreSnapshot', WeeklyScoreSnapshotSchema);
