/**
 * API intermediária para batidas do agente local (relógio).
 *
 * Responsabilidades:
 * - Validar schema das batidas vindas do agente
 * - Validar device_id (deve existir e pertencer à company)
 * - Rate limiting (por device/company)
 * - Inserir em clock_event_logs com source='clock'
 * - Retornar erro detalhado para o agente gerenciar retry
 *
 * Auth: Bearer API_KEY (compartilhado entre agente e servidor)
 *
 * POST /api/punch
 * Body: { deviceId, companyId, punches: [{ employee_id, occurred_at, event_type, dedupe_hash, raw }] }
 */

import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// ===== RATE LIMITING (in-memory, por instância) =====
interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minuto
const RATE_LIMIT_MAX_REQUESTS = 60;  // 60 requests por minuto por device

function getRateLimitKey(deviceId: string, companyId: string): string {
  return `${deviceId}:${companyId}`;
}

function checkRateLimit(deviceId: string, companyId: string): { allowed: boolean; remaining: number; resetIn: number } {
  const key = getRateLimitKey(deviceId, companyId);
  const now = Date.now();
  
  let entry = rateLimitMap.get(key);
  
  // Se não existe ou já expirou, criar novo
  if (!entry || entry.resetAt <= now) {
    entry = { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS };
    rateLimitMap.set(key, entry);
    return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - 1, resetIn: RATE_LIMIT_WINDOW_MS };
  }
  
  // Incrementar contador
  entry.count++;
  
  if (entry.count > RATE_LIMIT_MAX_REQUESTS) {
    return { allowed: false, remaining: 0, resetIn: entry.resetAt - now };
  }
  
  return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - entry.count, resetIn: entry.resetAt - now };
}

// Limpar entradas antigas a cada 5 minutos (evitar memory leak)
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap.entries()) {
    if (entry.resetAt <= now) {
      rateLimitMap.delete(key);
    }
  }
}, 5 * 60_000);

// Schema de validação Zod
const PunchSchema = z.object({
  employee_id: z.string().min(1),
  occurred_at: z.string().datetime(),
  // Aceita tipos específicos ou 'batida' genérica (será interpretada pelo backend)
  event_type: z.enum(['entrada', 'saída', 'saida', 'pausa', 'batida', 'E', 'S', 'P', 'B']),
  dedupe_hash: z.string().min(1),
  raw: z.record(z.any()).optional().default({}),
});

const RequestSchema = z.object({
  deviceId: z.string().min(1),
  companyId: z.string().min(1),
  punches: z.array(PunchSchema).min(1).max(1000),
});

export type PunchPayload = z.infer<typeof PunchSchema>;
export type BatchRequest = z.infer<typeof RequestSchema>;

function normalizeEventType(type: string): string {
  const t = type.toLowerCase().trim();
  if (t === 'saída') return 'saída';
  if (t === 'saida') return 'saída';
  if (t === 'entrada') return 'entrada';
  if (t === 'pausa') return 'pausa';
  if (t === 'batida') return 'batida';
  if (t === 'e') return 'entrada';
  if (t === 's') return 'saída';
  if (t === 'p') return 'pausa';
  if (t === 'b') return 'batida';
  return 'batida';
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Health check leve (para agente verificar disponibilidade antes de enviar batches)
  if (request.method === 'GET' || request.method === 'HEAD') {
    return Response.json(
      { ok: true, mode: 'api-punch', version: 1 },
      { status: 200, headers: corsHeaders }
    );
  }

  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders });
  }

  // Auth: API_KEY via Bearer ou x-api-key
  const apiKey = (process.env.CLOCK_AGENT_API_KEY || process.env.API_KEY || '').trim();
  if (!apiKey) {
    return Response.json(
      { error: 'API_KEY não configurada no servidor.' },
      { status: 500, headers: corsHeaders }
    );
  }

  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const xApiKey = request.headers.get('x-api-key') || '';

  if (token !== apiKey && xApiKey !== apiKey) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
  }

  // Parse e validação
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Body JSON inválido.' }, { status: 400, headers: corsHeaders });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: 'Schema inválido.', details: parsed.error.format() },
      { status: 400, headers: corsHeaders }
    );
  }

  const { deviceId, companyId, punches } = parsed.data;

  // ===== RATE LIMITING =====
  const rateLimit = checkRateLimit(deviceId, companyId);
  if (!rateLimit.allowed) {
    return Response.json(
      { 
        error: 'Rate limit exceeded.',
        retryAfter: Math.ceil(rateLimit.resetIn / 1000),
        deviceId,
        companyId,
      },
      { status: 429, headers: corsHeaders }
    );
  }

  // Conexão Supabase (service role - NUNCA exposta no frontend)
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim().replace(/\/$/, '');
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !serviceKey) {
    return Response.json(
      { error: 'Configuração Supabase ausente no servidor.' },
      { status: 500, headers: corsHeaders }
    );
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ===== VALIDAÇÃO DE DEVICE =====
  // Verificar se o device existe, pertence à company e está ativo
  const devicesTable = process.env.SUPABASE_DEVICES_TABLE || 'devices';
  const { data: device, error: deviceError } = await supabase
    .from(devicesTable)
    .select('id, company_id, active, brand, ip, name')
    .eq('id', deviceId)
    .eq('company_id', companyId)
    .eq('active', true)
    .maybeSingle();

  if (deviceError) {
    console.error('[API /punch] Erro ao validar device:', deviceError);
    return Response.json(
      { error: 'Erro ao validar device.', deviceId, companyId },
      { status: 500, headers: corsHeaders }
    );
  }

  if (!device) {
    return Response.json(
      { 
        error: 'Device não encontrado ou não autorizado.',
        details: 'Verifique se o device_id existe, pertence à company e está ativo.',
        deviceId,
        companyId,
      },
      { status: 403, headers: corsHeaders }
    );
  }

  // Log de auditoria (opcional: verificar IP se necessário)
  console.log(`[API /punch] Device validado: ${device.name} (${deviceId}) - ${punches.length} batidas`);

  // Montar rows para clock_event_logs
  const timeLogsTable = process.env.SUPABASE_TIME_LOGS_TABLE || 'clock_event_logs';
  const now = new Date().toISOString();

  const rows = punches.map((p) => ({
    employee_id: p.employee_id,
    occurred_at: p.occurred_at,
    event_type: normalizeEventType(p.event_type),
    device_id: deviceId,
    company_id: companyId,
    dedupe_hash: p.dedupe_hash,
    raw: {
      ...p.raw,
      _ingested_via: 'api/punch',
      _ingested_at: now,
    },
    source: 'clock',
    created_at: now,
  }));

  // Inserção em lote (ignore-duplicates)
  try {
    const { error } = await supabase
      .from(timeLogsTable)
      .insert(rows, { count: 'estimated' });

    if (error) {
      // Se for erro de violação única (dedupe), tratar como sucesso parcial
      if (error.code === '23505' || error.message?.includes('dedupe_hash')) {
        return Response.json(
          {
            success: true,
            partial: true,
            inserted: 0,
            duplicates: rows.length,
            message: 'Todos os registros já existem (duplicados).',
          },
          { status: 200, headers: corsHeaders }
        );
      }
      throw error;
    }

    return Response.json(
      {
        success: true,
        inserted: rows.length,
        duplicates: 0,
        deviceId,
        companyId,
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[API /punch] Erro ao inserir:', msg);
    return Response.json(
      {
        success: false,
        error: msg,
        deviceId,
        companyId,
        failedCount: rows.length,
      },
      { status: 500, headers: corsHeaders }
    );
  }
}
