const BASE_BOARDING_FEE_NGN = 300;
const RATE_PER_KILOMETER_NGN = 150;
const PEAK_HOUR_MULTIPLIER = 1.25;

function isPeakHour(now: Date): boolean {
  const lagosTimeParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lagos',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const hour = Number(lagosTimeParts.find((part) => part.type === 'hour')?.value);
  const minute = Number(lagosTimeParts.find((part) => part.type === 'minute')?.value);
  const currentMinutes = hour * 60 + minute;
  const morningPeak = currentMinutes >= 6 * 60 + 30 && currentMinutes <= 9 * 60 + 30;
  const eveningPeak = currentMinutes >= 16 * 60 && currentMinutes <= 20 * 60 + 30;
  return morningPeak || eveningPeak;
}

export function calculateLagosEstimatedFare(distanceKm: number, durationMins: number): number {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) {
    throw new Error('Distance must be a non negative number.');
  }
  if (!Number.isFinite(durationMins) || durationMins < 0) {
    throw new Error('Duration must be a non negative number.');
  }

  const baseFare = BASE_BOARDING_FEE_NGN + distanceKm * RATE_PER_KILOMETER_NGN;
  const fareWithPeakPricing = baseFare * (isPeakHour(new Date()) ? PEAK_HOUR_MULTIPLIER : 1);
  return Math.ceil(fareWithPeakPricing / 100) * 100;
}
