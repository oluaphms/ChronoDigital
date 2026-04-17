import { createClient } from '@supabase/supabase-js';
import { PUNCH_SOURCE_WEB } from '../src/constants/punchSource';
import { sendPunch } from '../src/services/sendPunch.service';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders });
  }

  const apiKey = (process.env.API_KEY || '').trim();
  if (!apiKey) {
    return Response.json({ error: 'API_KEY não configurada.' }, { status: 500, headers: corsHeaders });
  }

  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (token !== apiKey) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
  }

  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').toString().trim().replace(/\/$/, '');
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !serviceKey) {
    return Response.json({ error: 'Configuração Supabase ausente.' }, { status: 500, headers: corsHeaders });
  }

  let body: { employeeId?: string; companyId?: string; type?: string; method?: string; timestamp?: string } = {};
  try {
    const raw = await request.json();
    body = (raw && typeof raw === 'object' ? raw : {}) as typeof body;
  } catch {
    return Response.json({ error: 'Body inválido.' }, { status: 400, headers: corsHeaders });
  }

  const { employeeId, companyId, type, method, timestamp } = body;
  if (!employeeId || !companyId || !type || !timestamp) {
    return Response.json({ error: 'employeeId, companyId, type e timestamp são obrigatórios.' }, { status: 400, headers: corsHeaders });
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const ts = new Date(timestamp);
  if (Number.isNaN(ts.getTime())) {
    return Response.json({ error: 'timestamp inválido.' }, { status: 400, headers: corsHeaders });
  }

  const payload = {
    employee_id: employeeId,
    company_id: companyId,
    type,
    method: method || 'api',
    created_at: ts.toISOString(),
    source: PUNCH_SOURCE_WEB,
  };

  try {
    await sendPunch(supabase, payload);
  } catch (e: unknown) {
    const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : String(e);
    return Response.json({ error: msg }, { status: 500, headers: corsHeaders });
  }

  return Response.json({ success: true }, { status: 200, headers: corsHeaders });
}

