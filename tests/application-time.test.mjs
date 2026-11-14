import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isDateSimulationEnabled,
  resolveApplicationTime,
  scoreForApplicationWeek,
} from '../src/lib/applicationTime.js';

const realTime = new Date('2026-11-14T12:30:00.000Z');
const simulatedTime = new Date('2026-07-15T00:00:00.000Z');

test('simulation time requires an explicit dev or demo setting', () => {
  const development = resolveApplicationTime({
    now: realTime,
    simulatedDate: simulatedTime,
    env: { NODE_ENV: 'development', ENABLE_DATE_SIMULATION: 'true' },
  });
  assert.equal(development.getTime(), simulatedTime.getTime());

  const privateProduction = resolveApplicationTime({
    now: realTime,
    simulatedDate: simulatedTime,
    env: { NODE_ENV: 'production', ENABLE_DATE_SIMULATION: 'true', DEMO_MODE: 'false' },
  });
  assert.equal(privateProduction.getTime(), realTime.getTime());
  assert.equal(
    isDateSimulationEnabled({
      NODE_ENV: 'test',
      ENABLE_DATE_SIMULATION: 'true',
      DEMO_MODE: 'false',
    }),
    false
  );

  const explicitDemo = resolveApplicationTime({
    now: realTime,
    simulatedDate: simulatedTime,
    env: { NODE_ENV: 'production', ENABLE_DATE_SIMULATION: 'true', DEMO_MODE: 'true' },
  });
  assert.equal(explicitDemo.getTime(), simulatedTime.getTime());
});

test('scores from a prior week are not shown in the current contest week', () => {
  const applicationTime = new Date('2026-11-16T12:00:00.000Z');
  assert.equal(
    scoreForApplicationWeek(
      { cleanPlateScore: 75, cleanPlateScoreWeekStart: new Date('2026-11-09T00:00:00.000Z') },
      applicationTime
    ),
    0
  );
  assert.equal(
    scoreForApplicationWeek(
      { cleanPlateScore: 75, cleanPlateScoreWeekStart: new Date('2026-11-16T00:00:00.000Z') },
      applicationTime
    ),
    75
  );
  assert.equal(scoreForApplicationWeek({ cleanPlateScore: 12 }, applicationTime), 12);
});
