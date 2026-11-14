import mongoose from 'mongoose';

const RateLimitBucketSchema = new mongoose.Schema(
  {
    _id: { type: String },
    count: { type: Number, required: true },
    expiresAt: { type: Date, required: true },
  },
  { versionKey: false }
);

RateLimitBucketSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.RateLimitBucket ||
  mongoose.model('RateLimitBucket', RateLimitBucketSchema);
