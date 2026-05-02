/**
 * Converte data (YYYY-MM-DD) + hora (HH:mm) no **fuso local do navegador** em ISO UTC
 * para gravar em `timestamptz` (alinhado ao que o colaborador/admin escolhe no calendário).
 */
export function localDateAndTimeToIsoUtc(dateYmd: string, timeHm: string): string {
  const datePart = (dateYmd || '').trim().slice(0, 10);
  const timePart = ((timeHm || '').trim() || '00:00').slice(0, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    throw new RangeError(`Data inválida para registro (use AAAA-MM-DD): "${dateYmd}"`);
  }
  const [ys, ms, ds] = datePart.split('-');
  const [hs, mins] = timePart.split(':');
  const y = parseInt(ys || '0', 10);
  const mo = parseInt(ms || '1', 10);
  const d = parseInt(ds || '1', 10);
  const hh = parseInt(hs !== undefined ? hs : '0', 10);
  const mm = parseInt(mins !== undefined ? mins : '0', 10);
  if (
    !Number.isFinite(y) ||
    !Number.isFinite(mo) ||
    !Number.isFinite(d) ||
    !Number.isFinite(hh) ||
    !Number.isFinite(mm)
  ) {
    throw new RangeError(`Data ou horário inválido: "${dateYmd}" "${timeHm}"`);
  }
  const dt = new Date(y, mo - 1, d, hh, mm, 0, 0);
  if (Number.isNaN(dt.getTime())) {
    throw new RangeError(`Combinação data/hora inválida no calendário local: ${datePart} ${timePart}`);
  }
  return dt.toISOString();
}

/** YYYY-MM-DD no calendário local (não UTC) — alinha agrupamento do espelho com a data escolhida no formulário. */
export function localCalendarYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Início do dia civil local (00:00) em ISO UTC — usar em filtros `created_at` (timestamptz). */
export function localCalendarDayStartUtc(dateYmd: string): string {
  return localDateAndTimeToIsoUtc(dateYmd, '00:00');
}

/** Fim do dia civil local (23:59:59.999) em ISO UTC — usar em filtros `created_at` (timestamptz). */
export function localCalendarDayEndUtc(dateYmd: string): string {
  const datePart = dateYmd.slice(0, 10);
  const [ys, ms, ds] = datePart.split('-');
  const y = parseInt(ys || '0', 10);
  const mo = parseInt(ms || '1', 10);
  const d = parseInt(ds || '1', 10);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) {
    return new Date().toISOString();
  }
  const dt = new Date(y, mo - 1, d, 23, 59, 59, 999);
  return dt.toISOString();
}

/** Lista cada dia civil entre start e end (inclusive), em YYYY-MM-DD local. */
export function enumerateLocalCalendarDays(startYmd: string, endYmd: string): string[] {
  const dates: string[] = [];
  const start = new Date(startYmd + 'T00:00:00');
  const end = new Date(endYmd + 'T00:00:00');
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(localCalendarYmd(d));
  }
  return dates;
}
