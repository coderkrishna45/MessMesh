import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import { setupTokenClaimFilter, sameDatabase } from '../src/lib/accessPolicy.js';

const testUri = process.env.TEST_MONGODB_URI;

if (!testUri) {
  test('setup-token database integration (configure TEST_MONGODB_URI)', { skip: true }, () => {});
} else {
  test('setup tokens expire and can be consumed only once in the isolated test database', async () => {
    const databaseName = new URL(testUri).pathname.replace(/^\/+|\/+$/g, '').split('/')[0];
    assert.match(databaseName, /test/i, 'TEST_MONGODB_URI must target a database named for tests');
    assert.equal(sameDatabase(testUri, process.env.MONGODB_URI), false);
    assert.notEqual(databaseName.toLowerCase(), process.env.REAL_DATABASE_NAME?.toLowerCase());

    const mongoose = (await import('mongoose')).default;
    await mongoose.connect(testUri, { bufferCommands: false });
    const { default: AccountSetupToken } = await import('../src/lib/models/AccountSetupToken.js');
    const testPrefix = `security-test-${randomBytes(12).toString('hex')}`;
    const tokenHashes = [`${testPrefix}-expired`, `${testPrefix}-once`];
    const user = new mongoose.Types.ObjectId();
    try {
      await AccountSetupToken.create([
        {
          user,
          purpose: 'INVITATION',
          tokenHash: tokenHashes[0],
          expiresAt: new Date(Date.now() - 1000),
        },
        {
          user,
          purpose: 'PASSWORD_RESET',
          tokenHash: tokenHashes[1],
          expiresAt: new Date(Date.now() + 60_000),
        },
      ]);

      const expired = await AccountSetupToken.findOneAndUpdate(
        setupTokenClaimFilter(tokenHashes[0]),
        { $set: { consumedAt: new Date() } },
        { new: true }
      );
      assert.equal(expired, null);

      const consume = () =>
        AccountSetupToken.findOneAndUpdate(
          setupTokenClaimFilter(tokenHashes[1]),
          { $set: { consumedAt: new Date() } },
          { new: true }
        );
      const claims = await Promise.all([consume(), consume()]);
      assert.equal(claims.filter(Boolean).length, 1);
    } finally {
      await AccountSetupToken.deleteMany({ tokenHash: { $in: tokenHashes } });
      await mongoose.disconnect();
    }
  });
}
