import { useCallback, useEffect, useRef, useState } from 'react';

export interface GeoPosition {
  latitude: number;
  longitude: number;
  accuracy: number;
}

export type GeolocationStatus = 'idle' | 'loading' | 'success' | 'error';

interface UseGeolocationResult {
  position: GeoPosition | null;
  status: GeolocationStatus;
  error: string;
  isSupported: boolean;
  requestLocation: () => void;
  stopTracking: () => void;
}

function getGeolocationErrorMessage(error: GeolocationPositionError): string {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return 'Permission Denied. Allow location access in your browser settings, or enter coordinates manually.';
    case error.POSITION_UNAVAILABLE:
      return 'Your location is unavailable right now. Try again or enter coordinates manually.';
    case error.TIMEOUT:
      return 'Location detection timed out. Try again or enter coordinates manually.';
    default:
      return 'Could not detect your location. Try again or enter coordinates manually.';
  }
}

export function useGeolocation(): UseGeolocationResult {
  const [position, setPosition] = useState<GeoPosition | null>(null);
  const [status, setStatus] = useState<GeolocationStatus>('idle');
  const [error, setError] = useState('');
  const watchId = useRef<number | null>(null);
  const isSupported = typeof navigator !== 'undefined' && 'geolocation' in navigator;

  const stopTracking = useCallback(() => {
    if (watchId.current !== null && isSupported) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
  }, [isSupported]);

  const requestLocation = useCallback(() => {
    setError('');
    if (!isSupported) {
      setStatus('error');
      setError('Location is not supported by this browser. Enter coordinates manually.');
      return;
    }

    stopTracking();
    setStatus('loading');
    try {
      watchId.current = navigator.geolocation.watchPosition(
        (browserPosition) => {
          setPosition({
            latitude: browserPosition.coords.latitude,
            longitude: browserPosition.coords.longitude,
            accuracy: browserPosition.coords.accuracy,
          });
          setStatus('success');
          setError('');
        },
        (geolocationError) => {
          setStatus('error');
          setError(getGeolocationErrorMessage(geolocationError));
          stopTracking();
        },
        {
          enableHighAccuracy: true,
          maximumAge: 10_000,
          timeout: 15_000,
        },
      );
    } catch (cause) {
      setStatus('error');
      setError(cause instanceof Error
        ? `Could not start location detection: ${cause.message}`
        : 'Could not start location detection. Enter coordinates manually.');
    }
  }, [isSupported, stopTracking]);

  useEffect(() => stopTracking, [stopTracking]);

  return { position, status, error, isSupported, requestLocation, stopTracking };
}
