/**
 * Converte data (YYYY-MM-DD) + hora (HH:mm) no **fuso local do navegador** em ISO UTC
 * para gravar em `timestamptz` (alinhado ao que o colaborador/admin escolhe no calendário).
 */
export function localDateAndTimeToIsoUtc(dateYmd: string, timeHm: string): string {
  const datePart = dateYmd.slice(0, 10);
  const timePart = (timeHm || '00:00').slice(0, 5);
  const [ys, ms, ds] = datePart.split('-');
  const [hs, mins] = timePart.split(':');
  const y = parseInt(ys || '0', 10);
  const mo = parseInt(ms || '1', 10);
  const d = parseInt(ds || '1', 10);
  const hh = parseInt(hs || '0', 10);
  const mm = parseInt(mins || '0', 10);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) {
    return new Date().toISOString();
  }
  const dt = new Date(y, mo - 1, d, Number.isFinite(hh) ? hh : 0, Number.isFinite(mm) ? mm : 0, 0, 0);
  return dt.toISOString();
}
