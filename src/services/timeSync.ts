/**
 * Sincronização com Hora Legal Brasileira (Portaria 671 - REP-P).
 * Variação máxima permitida: 30 segundos.
 * Opções: NTP ou API Observatório Nacional / time servers.
 */

const BR_TIMEZONE = 'America/Sao_Paulo';
const MAX_DRIFT_SECONDS = 30;
const NTP_SERVERS = [
  'time.google.com',
  'time.windows.com',
  'pool.ntp.org',
];

export interface TimeSyncResult {
  synced: boolean;
  localTime: Date;
  serverTime?: Date;
  driftSeconds?: number;
  withinTolerance: boolean;
  message: string;
}

/**
 * Obtém hora do servidor via HTTP (fallback quando NTP não disponível no browser).
 * Usa cabeçalho Date da resposta.
 */
async function fetchServerTimeFromApi(): Promise<Date | null> {
  try {
    const res = await fetch('https://worldtimeapi.org/api/timezone/America/Sao_Paulo', {
      method: 'GET',
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = await res.json();
    const dt = data?.datetime;
    if (typeof dt === 'string') return new Date(dt);
    return null;
  } catch {
    return null;
  }
}

/**
 * Verifica se o relógio local está dentro da tolerância (30s) em relação à hora de referência.
 */
export function checkTimeTolerance(localTime: Date, referenceTime: Date): TimeSyncResult {
  const driftMs = Math.abs(localTime.getTime() - referenceTime.getTime());
  const driftSeconds = Math.floor(driftMs / 1000);
  const withinTolerance = driftSeconds <= MAX_DRIFT_SECONDS;

  return {
    synced: true,
    localTime: new Date(localTime),
    serverTime: new Date(referenceTime),
    driftSeconds,
    withinTolerance,
    message: withinTolerance
      ? `Hora dentro da tolerância (diferença ${driftSeconds}s).`
      : `Atenção: relógio local com diferença de ${driftSeconds}s (máx. ${MAX_DRIFT_SECONDS}s). Ajuste o relógio do dispositivo.`,
  };
}

/**
 * Sincroniza e valida a hora para registro de ponto.
 * Tenta obter hora de referência (World Time API) e compara com o relógio local.
 */
export async function syncAndValidateTime(): Promise<TimeSyncResult> {
  const localTime = new Date();

  const serverTime = await fetchServerTimeFromApi();
  if (!serverTime) {
    return {
      synced: false,
      localTime,
      withinTolerance: true,
      message:
        'Não foi possível obter hora de referência. O registro usará a hora do servidor (Supabase) ao bater o ponto.',
    };
  }

  return checkTimeTolerance(localTime, serverTime);
}

/**
 * Retorna a hora atual no fuso de São Paulo (para exibição).
 */
export function nowBrazil(): Date {
  return new Date(
    new Date().toLocaleString('en-US', { timeZone: BR_TIMEZONE })
  );
}

/**
 * Formata data/hora no padrão brasileiro.
 */
export function formatBrazilDateTime(d: Date): string {
  return d.toLocaleString('pt-BR', {
    timeZone: BR_TIMEZONE,
    dateStyle: 'short',
    timeStyle: 'medium',
  });
}
