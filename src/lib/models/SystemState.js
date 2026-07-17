import mongoose from 'mongoose';

const SystemStateSchema = new mongoose.Schema(
  {
    simulatedDate: {
      type: Date,
      default: () => new Date(Date.UTC(2026, 6, 15, 0, 0, 0, 0)), // Wednesday, July 15, 2026 (UTC)
    },
  },
  { timestamps: true }
);

if (mongoose.models.SystemState) {
  delete mongoose.models.SystemState;
}

export default mongoose.model('SystemState', SystemStateSchema);
