import type { RouteOption } from '../types';

export function formatCommuterRoute(route: RouteOption): RouteOption {
  if (route.dataQuality === 'estimate') return route;

  let boardingLocation = route.startPoint;
  const steps = route.steps.map((step, index) => {
    const alightingLocation = step.stopName?.trim()
      || (index === route.steps.length - 1 ? route.endPoint : route.steps[index + 1].stopName ?? route.endPoint);
    const vehicle = step.mode === 'brt'
      ? 'BRT bus'
      : step.mode === 'danfo'
        ? 'Danfo'
        : step.mode === 'keke'
          ? 'Keke'
          : step.mode === 'train'
            ? 'Train'
            : step.mode === 'ferry'
              ? 'Ferry'
              : 'Uber';
    const transportWorker = step.mode === 'danfo'
      ? 'conductor'
      : step.mode === 'brt' || step.mode === 'train' || step.mode === 'ferry'
        ? 'transport staff'
        : 'driver';
    const instruction = `Board a ${vehicle} at ${boardingLocation} heading towards ${alightingLocation}. Tell the ${transportWorker} you are alighting at ${alightingLocation}.`;
    boardingLocation = alightingLocation;
    return { ...step, instruction, stopName: alightingLocation };
  });

  return { ...route, steps };
}
