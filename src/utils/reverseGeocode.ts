/**
 * Geocodificação reversa (lat/lng → endereço legível).
 * Em produção, usa /api/reverse-geocode (evita CORS).
 *
 * Limita concorrência + deduplica requisições na mesma chave para não disparar
 * dezenas de chamadas serverless em paralelo (504 no gateway / limite Nominatim).
 */

const CACHE = new Map<string, string>();
const CACHE_MAX = 400;

/** Promessas em voo por chave (dedupe enquanto carrega). */
const IN_FLIGHT = new Map<string, Promise<string>>();

/** Máximo de pedidos HTTP ao /api em paralelo (global). */
const MAX_CONCURRENT = 2;
let activeRequests = 0;
const waitQueue: Array<() => void> = [];

function acquireSlot(): Promise<void> {
  if (activeRequests < MAX_CONCURRENT) {
    activeRequests += 1;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    waitQueue.push(() => {
      activeRequests += 1;
      resolve();
    });
  });
}

function releaseSlot(): void {
  activeRequests -= 1;
  const next = waitQueue.shift();
  if (next) next();
}

function cacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(5)},${lng.toFixed(5)}`;
}

function formatCoordFallback(lat: number, lng: number): string {
  return `Coordenadas: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

function pairFromNumbers(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  if (lat == null || lng == null) return null;
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return null;
  return { lat: la, lng: ln };
}

/**
 * Extrai lat/lng de uma linha `time_records` (colunas diretas, JSON `location`, GeoJSON, string JSON).
 */
export function extractLatLng(row: any): { lat: number; lng: number } | null {
  if (!row || typeof row !== 'object') return null;

  const direct = pairFromNumbers(row.latitude ?? row.lat, row.longitude ?? row.lng ?? row.lon);
  if (direct) return direct;

  let loc: unknown = row.location;
  if (typeof loc === 'string') {
    try {
      loc = JSON.parse(loc) as unknown;
    } catch {
      loc = null;
    }
  }

  if (loc && typeof loc === 'object') {
    const g = loc as Record<string, unknown>;
    if (g.type === 'Point' && Array.isArray(g.coordinates) && g.coordinates.length >= 2) {
      const ln = Number(g.coordinates[0]);
      const la = Number(g.coordinates[1]);
      if (Number.isFinite(la) && Number.isFinite(ln)) return { lat: la, lng: ln };
    }
    const geom = g.geometry;
    if (geom && typeof geom === 'object') {
      const gg = geom as Record<string, unknown>;
      if (gg.type === 'Point' && Array.isArray(gg.coordinates) && gg.coordinates.length >= 2) {
        const ln = Number(gg.coordinates[0]);
        const la = Number(gg.coordinates[1]);
        if (Number.isFinite(la) && Number.isFinite(ln)) return { lat: la, lng: ln };
      }
    }
    const nested = pairFromNumbers(
      g.lat ?? g.latitude,
      g.lng ?? g.lon ?? g.longitude,
    );
    if (nested) return nested;
  }

  return null;
}

function getOrigin(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return 'http://localhost:3010';
}

async function fetchAddressFromApi(lat: number, lng: number): Promise<string> {
  const FETCH_MS = 15000;
  const u = new URL('/api/reverse-geocode', getOrigin());
  u.searchParams.set('lat', String(lat));
  u.searchParams.set('lon', String(lng));

  const ctrl = new AbortController();
  let tid: number | undefined;
  if (typeof window !== 'undefined') {
    tid = window.setTimeout(() => ctrl.abort(), FETCH_MS) as unknown as number;
  }

  try {
    const res = await fetch(u.toString(), {
      headers: { Accept: 'application/json' },
      signal: ctrl.signal,
    });

    const ct = res.headers.get('content-type') || '';
    if (!res.ok) {
      return '';
    }
    if (!ct.includes('application/json')) {
      return '';
    }
    const data = (await res.json()) as { address?: string };
    if (typeof data.address === 'string') {
      const t = data.address.trim();
      // Qualquer texto não vindo da API substitui o fallback local por coordenadas puras.
      // (Antes filtrávamos o fallback PT do servidor; isso fazia a UI ignorar a resposta 200 e mostrar só "Coordenadas: …".)
      if (t) return t;
    }
  } catch {
    // rede / abort / 504 HTML
  } finally {
    if (typeof window !== 'undefined' && tid !== undefined) window.clearTimeout(tid);
  }
  return '';
}

/**
 * Retorna texto de endereço (rua, bairro, cidade). Em falha, texto com coordenadas (sempre útil na UI).
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const key = cacheKey(lat, lng);
  if (CACHE.has(key)) return CACHE.get(key)!;

  const pending = IN_FLIGHT.get(key);
  if (pending) return pending;

  const run = (async (): Promise<string> => {
    await acquireSlot();
    try {
      if (CACHE.has(key)) return CACHE.get(key)!;

      let text = await fetchAddressFromApi(lat, lng);
      if (!text) {
        text = formatCoordFallback(lat, lng);
      }

      if (CACHE.size >= CACHE_MAX) {
        const first = CACHE.keys().next().value;
        if (first !== undefined) CACHE.delete(first);
      }
      CACHE.set(key, text);
      return text;
    } finally {
      releaseSlot();
    }
  })();

  IN_FLIGHT.set(key, run);
  try {
    return await run;
  } finally {
    IN_FLIGHT.delete(key);
  }
}
