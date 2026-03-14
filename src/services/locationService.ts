/**
 * Serviço de geolocalização para registro de ponto (SmartPonto Antifraude).
 * Captura posição via navigator.geolocation.
 */

export interface GeoPosition {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp?: number;
}

export interface GetCurrentLocationOptions {
  enableHighAccuracy?: boolean;
  timeout?: number;
  maximumAge?: number;
}

const DEFAULT_OPTIONS: GetCurrentLocationOptions = {
  enableHighAccuracy: true,
  timeout: 15000,
  maximumAge: 60000,
};

/**
 * Obtém a localização atual do dispositivo.
 * Retorna null se o usuário negar, timeout ou API indisponível.
 */
export function getCurrentLocation(
  options: GetCurrentLocationOptions = {}
): Promise<GeoPosition | null> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy ?? 0,
          timestamp: position.timestamp,
        });
      },
      () => resolve(null),
      {
        enableHighAccuracy: opts.enableHighAccuracy,
        timeout: opts.timeout,
        maximumAge: opts.maximumAge ?? 0,
      }
    );
  });
}
