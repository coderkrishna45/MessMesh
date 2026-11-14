import mongoose from 'mongoose';

const WeeklyMenuInitializationSchema = new mongoose.Schema({
  _id: {
    type: String,
  },
  leaseOwner: {
    type: String,
  },
  leaseExpiresAt: {
    type: Date,
  },
});

export default mongoose.models.WeeklyMenuInitialization ||
  mongoose.model('WeeklyMenuInitialization', WeeklyMenuInitializationSchema);
