import type { RouteOption } from '../types';

export function rankRoutes(routes: RouteOption[], sortBy: 'fastest' | 'cheapest'): RouteOption[] {
  return [...routes].sort((left, right) => {
    if (sortBy === 'cheapest') return left.totalCostNgn - right.totalCostNgn;
    const confidenceOrder = Number(left.timeBasis === 'driving-proxy')
      - Number(right.timeBasis === 'driving-proxy');
    return confidenceOrder || left.totalTimeMinutes - right.totalTimeMinutes;
  });
}
