import SystemState from './models/SystemState.js';
import { getMondayUTC } from './weekUtils.js';

export function isDateSimulationEnabled(env = process.env) {
  return (
    env.ENABLE_DATE_SIMULATION === 'true' &&
    (env.NODE_ENV === 'development' || env.DEMO_MODE === 'true')
  );
}

export function resolveApplicationTime({
  simulatedDate,
  now = new Date(),
  env = process.env,
} = {}) {
  if (isDateSimulationEnabled(env) && simulatedDate) {
    const simulated = new Date(simulatedDate);
    if (!Number.isNaN(simulated.getTime())) return simulated;
  }
  return new Date(now);
}

export async function getApplicationTime({ now = new Date() } = {}) {
  if (!isDateSimulationEnabled()) return new Date(now);

  const state = await SystemState.findOne().select('simulatedDate').lean();
  const defaultSimulatedDate = SystemState.schema.path('simulatedDate').getDefault();
  return resolveApplicationTime({
    simulatedDate: state?.simulatedDate ?? defaultSimulatedDate,
    now,
  });
}

export function applicationDateStart(date) {
  const start = new Date(date);
  start.setUTCHours(0, 0, 0, 0);
  return start;
}

export function scoreForApplicationWeek(user, applicationTime) {
  const score = user.cleanPlateScore ?? 0;
  if (!user.cleanPlateScoreWeekStart) return score;

  const userWeek = getMondayUTC(user.cleanPlateScoreWeekStart);
  const currentWeek = getMondayUTC(applicationTime);
  return userWeek.getTime() === currentWeek.getTime() ? score : 0;
}
