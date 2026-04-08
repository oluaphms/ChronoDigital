/**
 * Geocodificação reversa (lat/lng → endereço legível).
 * Em produção (e no dev com middleware Vite), usa /api/reverse-geocode para evitar CORS do Photon.
 * Cache em memória para reduzir requisições.
 */

import { resolveAddressFromCoordinates } from './reverseGeocodeCore';

const CACHE = new Map<string, string>();
const CACHE_MAX = 400;

function cacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(5)},${lng.toFixed(5)}`;
}

export function extractLatLng(row: {
  location?: { lat?: number; lng?: number; lon?: number } | null;
  latitude?: number | null;
  longitude?: number | null;
}): { lat: number; lng: number } | null {
  if (row.latitude != null && row.longitude != null) {
    const lat = Number(row.latitude);
    const lng = Number(row.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  }
  const loc = row.location;
  if (loc && typeof loc === 'object') {
    const lat = loc.lat ?? (loc as { latitude?: number }).latitude;
    const lng = loc.lng ?? loc.lon ?? (loc as { longitude?: number }).longitude;
    if (lat != null && lng != null) {
      const la = Number(lat);
      const ln = Number(lng);
      if (!Number.isFinite(la) || !Number.isFinite(ln)) return null;
      return { lat: la, lng: ln };
    }
  }
  return null;
}

function getOrigin(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return 'http://localhost:3010';
}

/**
 * Retorna texto de endereço (rua, bairro, cidade). Sem coordenadas.
 * Em falha ou área sem dados, mensagem neutra — não expõe lat/lng.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const key = cacheKey(lat, lng);
  if (CACHE.has(key)) return CACHE.get(key)!;

  let text = '';
  try {
    const u = new URL('/api/reverse-geocode', getOrigin());
    u.searchParams.set('lat', String(lat));
    u.searchParams.set('lon', String(lng));
    const res = await fetch(u.toString(), {
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const data = (await res.json()) as { address?: string };
      if (typeof data.address === 'string') text = data.address.trim();
    }
  } catch {
    text = '';
  }

  if (!text) {
    text = await resolveAddressFromCoordinates(lat, lng);
  }

  if (CACHE.size >= CACHE_MAX) {
    const first = CACHE.keys().next().value;
    if (first !== undefined) CACHE.delete(first);
  }
  CACHE.set(key, text);
  return text;
}
