import RateLimitBucket from '@/lib/models/RateLimitBucket';

export async function checkDemoLimit(key, limit = 12, windowMs = 60_000) {
  const now = Date.now();
  const window = Math.floor(now / windowMs);
  const bucketId = `${key}:${window}`;
  const expiresAt = new Date((window + 1) * windowMs);
  let bucket;
  try {
    bucket = await RateLimitBucket.findOneAndUpdate(
      { _id: bucketId },
      { $inc: { count: 1 }, $setOnInsert: { expiresAt } },
      { upsert: true, new: true }
    );
  } catch (error) {
    if (error.code !== 11000) throw error;
    bucket = await RateLimitBucket.findOneAndUpdate(
      { _id: bucketId },
      { $inc: { count: 1 } },
      { new: true }
    );
  }
  return bucket.count <= limit
    ? { allowed: true }
    : {
        allowed: false,
        retryAfterSeconds: Math.ceil((expiresAt.getTime() - now) / 1000),
      };
}

export async function demoMutationResponse(user) {
  if (process.env.DEMO_MODE !== 'true') return null;
  const result = await checkDemoLimit(`mutation:${user._id}`);
  if (result.allowed) return null;
  return {
    success: false,
    error: 'Demo mutation rate limit reached. Try again shortly.',
    retryAfterSeconds: result.retryAfterSeconds,
  };
}
