/**
 * Adapter Dimep — leitura via AFD (Arquivo Fonte de Dados).
 * Suporta:
 * - Arquivo local (caminho em extra.afd_file)
 * - Conteúdo em memória (extra.afd_text ou extra.afd_mock)
 * - Mock padrão para desenvolvimento
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ClockAdapter, DeviceConfig, Punch } from './types';

const DEFAULT_TZ = 'America/Sao_Paulo';

/**
 * Parse de linha AFD tipo 3 (marcacao de ponto)
 * Formato: NSR(9) + Tipo(1) + Data(8) + Hora(6) + PIS(12)
 * Exemplo: 00000000131204202410300012345678901E
 */
function parseAfdLine(line: string, device: DeviceConfig, tz: string): Punch | null {
  // Remover whitespace
  const clean = line.trim();
  if (clean.length < 38) return null;

  // Tipo 3 = marcação de ponto
  const tipo = clean.charAt(9);
  if (tipo !== '3') return null;

  const nsr = parseInt(clean.substring(0, 9), 10);
  const data = clean.substring(10, 18); // DDMMAAAA
  const hora = clean.substring(18, 24); // HHMMSS
  const pis = clean.substring(24, 36); // 12 dígitos

  // Validar data
  const dia = parseInt(data.substring(0, 2), 10);
  const mes = parseInt(data.substring(2, 4), 10);
  const ano = parseInt(data.substring(4, 8), 10);

  if (dia < 1 || dia > 31 || mes < 1 || mes > 12 || ano < 2000) return null;

  // Validar hora
  const hh = parseInt(hora.substring(0, 2), 10);
  const mm = parseInt(hora.substring(2, 4), 10);
  const ss = parseInt(hora.substring(4, 6), 10);

  if (hh > 23 || mm > 59 || ss > 59) return null;

  // Construir timestamp ISO
  const isoString = `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  const date = new Date(isoString);

  if (Number.isNaN(date.getTime())) return null;

  // Determinar tipo de evento
  let eventType: Punch['event_type'] = 'batida';
  
  // Verificar se há indicador de entrada/saída no final da linha ou no contexto
  const lastChar = clean.charAt(clean.length - 1).toUpperCase();
  if (lastChar === 'E' || lastChar === 'I') {
    eventType = 'entrada';
  } else if (lastChar === 'S' || lastChar === 'O') {
    eventType = 'saída';
  }

  return {
    employee_id: pis.replace(/\D/g, '').slice(0, 11) || pis,
    timestamp: date.toISOString(),
    event_type: eventType,
    device_id: device.id,
    company_id: device.company_id,
    nsr,
    raw: {
      nsr,
      tipo_registro: tipo,
      data_afd: data,
      hora_afd: hora,
      pis,
      timezone: tz,
      source: 'dimep_afd',
    },
  };
}

function parseAfdContent(device: DeviceConfig, content: string, tz: string): Punch[] {
  const lines = content.split(/\r?\n/);
  const punches: Punch[] = [];

  for (const line of lines) {
    const punch = parseAfdLine(line, device, tz);
    if (punch) punches.push(punch);
  }

  return punches;
}

function readAfdContent(device: DeviceConfig): string | null {
  const ex = device.extra || {};
  
  // Prioridade 1: texto em memória
  if (typeof ex.afd_text === 'string' && ex.afd_text.trim()) {
    return ex.afd_text;
  }
  
  // Prioridade 2: mock
  if (typeof ex.afd_mock === 'string' && ex.afd_mock.trim()) {
    return ex.afd_mock;
  }
  
  // Prioridade 3: arquivo
  const filePath = typeof ex.afd_file === 'string' ? ex.afd_file.trim() : '';
  if (filePath) {
    const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
    if (fs.existsSync(resolved)) {
      return fs.readFileSync(resolved, 'utf8');
    }
  }
  
  return null;
}

/** Mock AFD para desenvolvimento */
function defaultMockAfd(device: DeviceConfig): string {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = String(now.getFullYear());
  const hh = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const data = `${dd}${mm}${yyyy}`;
  const hora = `${hh}${mi}${ss}`;
  
  return `0000000013${data}${hora}12345678901E`;
}

function filterSince(records: Punch[], lastSync?: string): Punch[] {
  if (!lastSync) return records;
  const t0 = new Date(lastSync).getTime();
  if (Number.isNaN(t0)) return records;
  return records.filter((r) => {
    const t = new Date(r.timestamp).getTime();
    return !Number.isNaN(t) && t > t0;
  });
}

function generateDedupeHash(punch: Punch): string {
  const base = `${punch.company_id}|${punch.device_id}|${punch.employee_id}|${punch.timestamp}|${punch.event_type}`;
  return require('crypto').createHash('sha256').update(base, 'utf8').digest('hex');
}

export const dimepAdapter: ClockAdapter = {
  async getPunches(device: DeviceConfig, lastSync?: string): Promise<Punch[]> {
    const tz =
      typeof device.extra?.afd_timezone === 'string' && device.extra.afd_timezone.trim()
        ? device.extra.afd_timezone.trim()
        : DEFAULT_TZ;
    
    let text = readAfdContent(device);
    if (!text) {
      text = defaultMockAfd(device);
    }
    
    const punches = parseAfdContent(device, text, tz);
    
    // Adicionar dedupe_hash
    for (const punch of punches) {
      if (!punch.dedupe_hash) {
        punch.dedupe_hash = generateDedupeHash(punch);
      }
    }
    
    return filterSince(punches, lastSync);
  },
};
