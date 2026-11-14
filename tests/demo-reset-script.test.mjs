import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearDemoCollections,
  getDemoResetDate,
  initializeDemoWeek,
} from '../scripts/reset-demo.mjs';

const resetCollectionNames = [
  'User',
  'Dish',
  'WeeklyPoll',
  'WeeklyMenu',
  'WasteLog',
  'MealRating',
  'SystemState',
  'WeeklyScoreSnapshot',
  'WeeklyScoreState',
  'WeeklyMenuInitialization',
  'AccountAudit',
  'AccountSetupToken',
  'RateLimitBucket',
];

test('demo reset clears operational weekly score and menu initialization state', async () => {
  const deletedCollections = [];
  const models = Object.fromEntries(
    resetCollectionNames.map((name) => [
      name,
      {
        async deleteMany(filter) {
          assert.deepEqual(filter, {});
          deletedCollections.push(name);
        },
      },
    ])
  );

  await clearDemoCollections(models);

  assert.deepEqual(deletedCollections.sort(), [...resetCollectionNames].sort());
});

test('demo reset date follows explicit simulation configuration', () => {
  const now = new Date('2026-11-14T12:34:56.000Z');
  const simulationEnvironment = {
    DEMO_MODE: 'true',
    NODE_ENV: 'production',
    ENABLE_DATE_SIMULATION: 'true',
  };
  assert.equal(
    getDemoResetDate(simulationEnvironment, now).toISOString(),
    '2026-07-15T00:00:00.000Z'
  );
  assert.equal(
    getDemoResetDate(
      { ...simulationEnvironment, ENABLE_DATE_SIMULATION: 'false' },
      now
    ).toISOString(),
    now.toISOString()
  );
});

test('demo weekly initialization uses the same date for score period and menu week', async () => {
  const date = new Date('2026-07-15T12:00:00.000Z');
  const calls = [];

  await initializeDemoWeek(date, {
    async initializeScorePeriod(value) {
      calls.push(['score', value]);
    },
    async initializeMenu(value) {
      calls.push(['menu', value]);
    },
  });

  assert.deepEqual(calls, [
    ['score', date],
    ['menu', new Date('2026-07-13T00:00:00.000Z')],
  ]);
});
