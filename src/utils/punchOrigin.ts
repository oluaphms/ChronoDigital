/**
 * Origem da batida (relógio vs app) — alinha `source`/`method` legados com campos `origin`/`source_type` (migração).
 */

export type PunchOriginKind = 'rep' | 'mobile' | 'admin' | 'unknown';

export function recordPunchInstantIso(r: {
  timestamp?: string | null;
  created_at?: string | null;
}): string {
  const ts = r.timestamp != null && String(r.timestamp).trim() !== '' ? String(r.timestamp).trim() : '';
  if (ts) return ts;
  return String(r.created_at ?? '');
}

export function recordPunchInstantMs(r: {
  timestamp?: string | null;
  created_at?: string | null;
}): number {
  const iso = recordPunchInstantIso(r);
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
}

/** Relógio / REP / agente de coleta (sem localização válida no modelo). */
export function isRepPunchRecord(r: {
  origin?: string | null;
  source?: string | null;
  method?: string | null;
}): boolean {
  const o = String(r.origin ?? '')
    .trim()
    .toLowerCase();
  if (o === 'rep') return true;
  const s = String(r.source ?? '')
    .trim()
    .toLowerCase();
  const m = String(r.method ?? '')
    .trim()
    .toLowerCase();
  return s === 'rep' || m === 'rep' || s === 'clock';
}

export function resolvePunchOrigin(r: {
  origin?: string | null;
  source?: string | null;
  method?: string | null;
}): { kind: PunchOriginKind; label: string; sourceType: string } {
  const o = String(r.origin ?? '')
    .trim()
    .toLowerCase();
  if (o === 'rep') {
    return { kind: 'rep', label: 'Relógio', sourceType: 'control_id' };
  }
  if (o === 'mobile' || o === 'app') {
    return { kind: 'mobile', label: 'App', sourceType: 'app' };
  }
  if (o === 'admin') {
    return { kind: 'admin', label: 'Manual / RH', sourceType: 'app' };
  }
  if (isRepPunchRecord(r)) {
    return { kind: 'rep', label: 'Relógio', sourceType: 'control_id' };
  }
  const m = String(r.method ?? '')
    .trim()
    .toLowerCase();
  const s = String(r.source ?? '')
    .trim()
    .toLowerCase();
  if (m === 'admin' || s === 'admin') {
    return { kind: 'admin', label: 'Manual / RH', sourceType: 'app' };
  }
  return { kind: 'mobile', label: 'App', sourceType: 'app' };
}

export function shouldHidePunchLocation(r: {
  origin?: string | null;
  source?: string | null;
  method?: string | null;
}): boolean {
  return isRepPunchRecord(r);
}
