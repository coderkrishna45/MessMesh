import mongoose from 'mongoose';

const WeeklyScoreStateSchema = new mongoose.Schema({
  _id: {
    type: String,
    default: 'global',
  },
  currentWeekStart: {
    type: Date,
  },
  leaseOwner: {
    type: String,
  },
  leaseExpiresAt: {
    type: Date,
  },
});

export default mongoose.models.WeeklyScoreState ||
  mongoose.model('WeeklyScoreState', WeeklyScoreStateSchema);
