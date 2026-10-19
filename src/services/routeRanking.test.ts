import { describe, expect, it } from 'vitest';
import type { RouteOption } from '../types';
import { buildDistanceEstimateRoutes } from './routeEstimates';
import { rankRoutes } from './routeRanking';
import { formatCommuterRoute } from './commuterGuidance';

function route(id: string, time: number, cost: number, timeBasis: RouteOption['timeBasis']): RouteOption {
  return {
    id,
    title: id,
    mode: 'brt',
    dataQuality: timeBasis === 'transit-estimate' ? 'curated' : 'estimate',
    timeBasis,
    fareBasis: timeBasis === 'transit-estimate' ? 'baseline' : 'estimate',
    startPoint: 'CMS',
    endPoint: 'Ikeja',
    totalTimeMinutes: time,
    totalCostNgn: cost,
    trafficStatus: 'unknown',
    transfersCount: 0,
    steps: [{ instruction: 'Travel to destination', mode: 'brt', duration: time, cost }],
  };
}

describe('rankRoutes', () => {
  it('ranks transit timings ahead of driving proxies, then by time', () => {
    const routes = [
      route('proxy-fast', 15, 800, 'driving-proxy'),
      route('transit-slow', 45, 900, 'transit-estimate'),
      route('transit-fast', 30, 1_000, 'transit-estimate'),
    ];

    expect(rankRoutes(routes, 'fastest').map((item) => item.id))
      .toEqual(['transit-fast', 'transit-slow', 'proxy-fast']);
    expect(routes[0].id).toBe('proxy-fast');
  });

  it('sorts lowest fare first without mislabeling the fare estimate', () => {
    const routes = [
      route('baseline', 25, 900, 'transit-estimate'),
      route('rough', 10, 500, 'driving-proxy'),
    ];

    expect(rankRoutes(routes, 'cheapest').map((item) => item.id)).toEqual(['rough', 'baseline']);
  });
});

describe('buildDistanceEstimateRoutes', () => {
  it('labels every fallback as a rough fare and driving-time proxy', () => {
    const routes = buildDistanceEstimateRoutes('Yaba', 'Ikeja', 12, 35, ['danfo', 'brt']);

    expect(routes).toHaveLength(2);
    for (const item of routes) {
      expect(item.dataQuality).toBe('estimate');
      expect(item.timeBasis).toBe('driving-proxy');
      expect(item.fareBasis).toBe('estimate');
      expect(item.trafficStatus).toBe('unknown');
      expect(item.steps[0].instruction).toContain('No mapped transit route');
      expect(item.totalTimeMinutes).toBe(35);
      expect(item.totalCostNgn).toBeGreaterThan(0);
    }
  });

  describe('formatCommuterRoute', () => {
    it('does not invent boarding guidance for an estimated route', () => {
      const estimated = buildDistanceEstimateRoutes('Yaba', 'Ikeja', 12, 35, ['danfo'])[0];
      expect(formatCommuterRoute(estimated)).toBe(estimated);
      expect(formatCommuterRoute(estimated).steps[0].instruction).toContain('No mapped transit route');
    });

    it('uses mapped stops to describe boarding and alighting', () => {
      const mapped = {
        ...route('mapped', 35, 750, 'transit-estimate'),
        steps: [{
          instruction: 'Old instruction',
          mode: 'brt' as const,
          duration: 35,
          cost: 750,
          stopName: 'Ikeja Along',
        }],
      };

      expect(formatCommuterRoute(mapped).steps[0].instruction)
        .toContain('Board a BRT bus at CMS heading towards Ikeja Along');
    });
  });

  it('rejects invalid distance and duration inputs', () => {
    expect(() => buildDistanceEstimateRoutes('Yaba', 'Ikeja', -1, 35, ['danfo']))
      .toThrow('Distance must be a non negative number.');
    expect(() => buildDistanceEstimateRoutes('Yaba', 'Ikeja', 12, Number.NaN, ['danfo']))
      .toThrow('Duration must be a non negative number.');
  });
});
