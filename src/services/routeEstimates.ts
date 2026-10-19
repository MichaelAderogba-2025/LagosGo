import { calculateLagosEstimatedFare } from '../utils/fareCalculator';
import type { RouteOption, TransportMode } from '../types';

export function buildDistanceEstimateRoutes(
  originArea: string,
  destinationArea: string,
  distanceKm: number,
  drivingDurationMinutes: number,
  modes: TransportMode[],
): RouteOption[] {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) {
    throw new Error('Distance must be a non negative number.');
  }
  if (!Number.isFinite(drivingDurationMinutes) || drivingDurationMinutes < 0) {
    throw new Error('Duration must be a non negative number.');
  }
  const fare = calculateLagosEstimatedFare(distanceKm, drivingDurationMinutes);

  return modes.map((mode) => {
    const title = `${mode.toUpperCase()} estimate: ${originArea} to ${destinationArea}`;
    return {
      id: `estimate:${mode}:${originArea}:${destinationArea}`,
      title,
      mode,
      dataQuality: 'estimate',
      timeBasis: 'driving-proxy',
      fareBasis: 'estimate',
      startPoint: originArea,
      endPoint: destinationArea,
      totalTimeMinutes: drivingDurationMinutes,
      totalCostNgn: fare,
      trafficStatus: 'unknown',
      transfersCount: 0,
      steps: [{
        instruction: `No mapped transit route is available from ${originArea} to ${destinationArea}.`,
        mode,
        duration: drivingDurationMinutes,
        cost: fare,
        stopName: destinationArea,
      }],
    };
  });
}
