/**
 * Handlers HTTP para /api/rep/* (função serverless em api/rep-bridge.ts — limite Hobby 12).
 */

import { createClient } from '@supabase/supabase-js';
import { authenticateRepDeviceRequest, repCorsHeaders } from './repVercelAuth';
import { getSupabaseAnonKeyResolved, getSupabaseUrlResolved } from './repVercelEnv';
import { runRepConnectionTest, getPunchesFromDeviceServer } from './repDeviceServer';
import { syncRepDevices } from './repSyncJob';
import { ingestPunch } from './repService';
import { parseAFD, parseTxtOrCsv } from './repParser';
import { ingestAfdRecords } from './repService';

const corsSync: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const corsPunch: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-REP-API-Key',
};

const corsImport: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

async function handleStatus(request: Request): Promise<Response> {
  const headers = { ...repCorsHeaders(request), 'Content-Type': 'application/json' };
  try {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }
    if (request.method !== 'GET') {
      return Response.json({ error: 'Method not allowed' }, { status: 405, headers });
    }
    const urlObj = new URL(request.url);
    const deviceId = urlObj.searchParams.get('device_id');
    const auth = await authenticateRepDeviceRequest(request, deviceId);
    if (auth instanceof Response) return auth;
    const { device } = auth;
    if (device.tipo_conexao !== 'rede') {
      return Response.json({ ok: false, message: 'Dispositivo não é do tipo rede (IP).' }, { status: 400, headers });
    }
    const r = await runRepConnectionTest(device);
    if (!r.ok && (r.httpStatus === 0 || r.httpStatus === undefined) && r.message) {
      return Response.json({ ok: false, message: r.message }, { status: 200, headers });
    }
    return Response.json(
      {
        ok: r.ok,
        message: r.message || (r.ok ? 'Conexão OK' : 'Falha'),
        httpStatus: r.httpStatus ?? (r.ok ? 200 : 0),
        body: r.body,
      },
      { status: 200, headers }
    );
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Erro interno no proxy REP (status)';
    console.error('[api/rep/status]', e);
    return Response.json({ ok: false, error: message }, { status: 500, headers });
  }
}

async function handlePunches(request: Request): Promise<Response> {
  const headers = { ...repCorsHeaders(request), 'Content-Type': 'application/json' };
  try {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }
    if (request.method !== 'GET') {
      return Response.json({ error: 'Method not allowed' }, { status: 405, headers });
    }
    const urlObj = new URL(request.url);
    const deviceId = urlObj.searchParams.get('device_id');
    const sinceRaw = urlObj.searchParams.get('since');
    const auth = await authenticateRepDeviceRequest(request, deviceId);
    if (auth instanceof Response) return auth;
    const { device } = auth;
    if (device.tipo_conexao === 'arquivo') {
      return Response.json({ ok: false, message: 'Dispositivo configurado apenas para arquivo.' }, { status: 400, headers });
    }
    let since: Date | undefined;
    if (sinceRaw) {
      const d = new Date(sinceRaw);
      if (!Number.isNaN(d.getTime())) since = d;
    }
    try {
      const punches = await getPunchesFromDeviceServer(device, since);
      try {
        return Response.json({ ok: true, punches }, { status: 200, headers });
      } catch (ser: unknown) {
        console.error('[api/rep/punches] JSON serialize', ser);
        return Response.json(
          { ok: false, message: 'Resposta do relógio não pôde ser serializada (dados inválidos).' },
          { status: 500, headers }
        );
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Erro ao ler marcações do relógio';
      return Response.json({ ok: false, message }, { status: 200, headers });
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Erro interno no proxy REP';
    console.error('[api/rep/punches]', e);
    return Response.json({ ok: false, error: message }, { status: 500, headers });
  }
}

async function handleSync(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsSync });
  }
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405, headers: corsSync });
  }
  const apiKey = (process.env.API_KEY || process.env.CRON_SECRET || '').trim();
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!apiKey || token !== apiKey) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: { ...corsSync, 'Content-Type': 'application/json' } });
  }
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').toString().trim().replace(/\/$/, '');
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !serviceKey) {
    return Response.json({ error: 'Supabase não configurado' }, { status: 500, headers: { ...corsSync, 'Content-Type': 'application/json' } });
  }
  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const urlObj = new URL(request.url);
  const companyId = urlObj.searchParams.get('company_id') || undefined;
  const result = await syncRepDevices(supabase, companyId);
  return Response.json(
    {
      success: result.errors.length === 0,
      total_devices: result.total,
      imported: result.imported,
      errors: result.errors,
    },
    { status: 200, headers: { ...corsSync, 'Content-Type': 'application/json' } }
  );
}

interface RepPunchBody {
  pis?: string;
  cpf?: string;
  matricula?: string;
  data_hora: string;
  tipo_marcacao?: string;
  nsr?: number;
  device_id?: string;
  company_id: string;
}

async function handlePunch(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsPunch });
  }
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405, headers: corsPunch });
  }
  const apiKey = (process.env.API_KEY || process.env.REP_API_KEY || '').trim();
  const authHeader = request.headers.get('Authorization') || request.headers.get('X-REP-API-Key') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!apiKey || token !== apiKey) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: { ...corsPunch, 'Content-Type': 'application/json' } });
  }
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').toString().trim().replace(/\/$/, '');
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !serviceKey) {
    return Response.json({ error: 'Supabase não configurado' }, { status: 500, headers: { ...corsPunch, 'Content-Type': 'application/json' } });
  }
  let body: RepPunchBody;
  try {
    const raw = await request.json();
    body = (raw && typeof raw === 'object' ? raw : {}) as RepPunchBody;
  } catch {
    return Response.json({ error: 'Body inválido' }, { status: 400, headers: { ...corsPunch, 'Content-Type': 'application/json' } });
  }
  const { company_id, data_hora, device_id, nsr, pis, cpf, matricula, tipo_marcacao } = body;
  if (!company_id || !data_hora) {
    return Response.json(
      { error: 'company_id e data_hora são obrigatórios' },
      { status: 400, headers: { ...corsPunch, 'Content-Type': 'application/json' } }
    );
  }
  const ts = new Date(data_hora);
  if (Number.isNaN(ts.getTime())) {
    return Response.json({ error: 'data_hora inválido' }, { status: 400, headers: { ...corsPunch, 'Content-Type': 'application/json' } });
  }
  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const result = await ingestPunch(supabase, {
    company_id,
    rep_device_id: device_id || null,
    pis: pis ?? null,
    cpf: cpf ?? null,
    matricula: matricula ?? null,
    nome_funcionario: null,
    data_hora: ts.toISOString(),
    tipo_marcacao: tipo_marcacao || 'E',
    nsr: nsr ?? null,
    raw_data: { source: 'api' },
  });
  if (!result.success && result.error) {
    const status = result.error.includes('já importado') ? 200 : 400;
    return Response.json(
      { success: false, error: result.error, duplicate: result.error.includes('já importado') },
      { status, headers: { ...corsPunch, 'Content-Type': 'application/json' } }
    );
  }
  return Response.json(
    {
      success: true,
      time_record_id: result.time_record_id,
      user_not_found: result.user_not_found,
    },
    { status: 200, headers: { ...corsPunch, 'Content-Type': 'application/json' } }
  );
}

async function handleImportAfd(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsImport });
  }
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405, headers: corsImport });
  }
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return Response.json({ error: 'Authorization obrigatório' }, { status: 401, headers: { ...corsImport, 'Content-Type': 'application/json' } });
  }
  const supabaseUrl = getSupabaseUrlResolved();
  const anonKey = getSupabaseAnonKeyResolved();
  if (!supabaseUrl || !anonKey) {
    return Response.json({ error: 'Supabase não configurado' }, { status: 500, headers: { ...corsImport, 'Content-Type': 'application/json' } });
  }
  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) {
    return Response.json({ error: 'Token inválido ou expirado' }, { status: 401, headers: { ...corsImport, 'Content-Type': 'application/json' } });
  }
  const contentType = request.headers.get('Content-Type') || '';
  let companyId: string;
  let repDeviceId: string | null = null;
  let fileContent: string;
  if (contentType.includes('application/json')) {
    const body = (await request.json()) as { company_id: string; rep_device_id?: string; content?: string; filename?: string };
    companyId = body.company_id;
    repDeviceId = body.rep_device_id || null;
    if (!companyId) {
      return Response.json({ error: 'company_id obrigatório' }, { status: 400, headers: { ...corsImport, 'Content-Type': 'application/json' } });
    }
    if (body.content) {
      try {
        fileContent =
          typeof body.content === 'string' && body.content.includes(',') && body.content.length > 100
            ? atob(body.content)
            : body.content;
      } catch {
        fileContent = body.content as string;
      }
    } else {
      return Response.json({ error: 'content obrigatório no body JSON' }, { status: 400, headers: { ...corsImport, 'Content-Type': 'application/json' } });
    }
  } else if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    companyId = (formData.get('company_id') as string) || '';
    repDeviceId = (formData.get('rep_device_id') as string) || null;
    const file = formData.get('file') as File | null;
    if (!companyId || !file) {
      return Response.json({ error: 'company_id e file obrigatórios' }, { status: 400, headers: { ...corsImport, 'Content-Type': 'application/json' } });
    }
    fileContent = await file.text();
  } else {
    return Response.json(
      { error: 'Content-Type deve ser application/json ou multipart/form-data' },
      { status: 400, headers: { ...corsImport, 'Content-Type': 'application/json' } }
    );
  }
  const { data: profile } = await supabase.from('users').select('company_id, role').eq('id', user.id).single();
  const userCompanyId = (profile as { company_id?: string; role?: string } | null)?.company_id;
  const role = (profile as { role?: string } | null)?.role;
  if (role !== 'admin' && role !== 'hr') {
    return Response.json({ error: 'Sem permissão para importar AFD' }, { status: 403, headers: { ...corsImport, 'Content-Type': 'application/json' } });
  }
  if (userCompanyId && companyId !== userCompanyId) {
    return Response.json({ error: 'company_id não autorizado' }, { status: 403, headers: { ...corsImport, 'Content-Type': 'application/json' } });
  }
  const isCsv = fileContent.includes(',') && fileContent.split('\n')[0].includes(',');
  const records = isCsv ? parseTxtOrCsv(fileContent, ',') : parseAFD(fileContent);
  if (records.length === 0) {
    return Response.json({ error: 'Nenhum registro válido encontrado no arquivo' }, { status: 400, headers: { ...corsImport, 'Content-Type': 'application/json' } });
  }
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const supabaseAdmin = serviceKey
    ? createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
    : supabase;
  const result = await ingestAfdRecords(supabaseAdmin, companyId, repDeviceId, records);
  return Response.json(
    {
      success: true,
      total: records.length,
      imported: result.imported,
      duplicated: result.duplicated,
      user_not_found: result.userNotFound,
      errors: result.errors.slice(0, 10),
    },
    { status: 200, headers: { ...corsImport, 'Content-Type': 'application/json' } }
  );
}

/**
 * Despacha slug REP (mantém URLs públicas: status, punches, sync, punch, import-afd).
 */
export async function handleRepSlug(request: Request, slug: string): Promise<Response> {
  switch (slug) {
    case 'status':
      return handleStatus(request);
    case 'punches':
      return handlePunches(request);
    case 'sync':
      return handleSync(request);
    case 'punch':
      return handlePunch(request);
    case 'import-afd':
      return handleImportAfd(request);
    default:
      return Response.json({ error: 'Rota REP desconhecida' }, { status: 404, headers: { 'Content-Type': 'application/json' } });
  }
}
