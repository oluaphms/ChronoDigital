/**
 * POST /api/jobs/calc-period
 * Body: { employee_id, start_date, end_date }
 * Enfileira CALC_PERIOD; resposta: { job_id }.
 * Header: Authorization: Bearer <JWT>
 */

import { createClient } from '@supabase/supabase-js';
import { getCallerContext, isAdminOrHr } from '../_shared/callerContext';
import { JOB_TYPE } from '../../src/services/jobs/jobTypes';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const MAX_DAYS = 120;

function isYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (request.method !== 'POST') {
    return Response.json(
      { error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' },
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '')
    .toString()
    .trim()
    .replace(/\/$/, '');
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const anonKey = (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim();

  if (!serviceKey || !supabaseUrl) {
    return Response.json(
      { error: 'Supabase não configurado.', code: 'CONFIG_MISSING' },
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const authHeader = request.headers.get('Authorization') || request.headers.get('authorization') || '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!jwt) {
    return Response.json(
      { error: 'Token obrigatório.', code: 'UNAUTHORIZED' },
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const serviceClient = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const caller = await getCallerContext(supabaseUrl, anonKey, serviceClient, jwt);
  if (!caller) {
    return Response.json(
      { error: 'Sessão inválida.', code: 'UNAUTHORIZED' },
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
  if (!isAdminOrHr(caller.role)) {
    return Response.json(
      { error: 'Apenas administrador ou RH.', code: 'FORBIDDEN' },
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  let body: { employee_id?: string; start_date?: string; end_date?: string } = {};
  try {
    const raw = await request.json();
    body = (raw && typeof raw === 'object' ? raw : {}) as typeof body;
  } catch {
    return Response.json(
      { error: 'Body inválido.', code: 'BAD_REQUEST' },
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const employee_id = typeof body.employee_id === 'string' ? body.employee_id.trim() : '';
  const start_date = typeof body.start_date === 'string' ? body.start_date.trim() : '';
  const end_date = typeof body.end_date === 'string' ? body.end_date.trim() : '';

  if (!employee_id || !isYmd(start_date) || !isYmd(end_date)) {
    return Response.json(
      { error: 'Informe employee_id e datas YYYY-MM-DD.', code: 'BAD_REQUEST' },
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
  if (start_date > end_date) {
    return Response.json(
      { error: 'start_date não pode ser maior que end_date.', code: 'BAD_REQUEST' },
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const d0 = new Date(`${start_date}T12:00:00`);
  const d1 = new Date(`${end_date}T12:00:00`);
  const diffDays = Math.floor((d1.getTime() - d0.getTime()) / (86400000)) + 1;
  if (diffDays > MAX_DAYS || diffDays < 1) {
    return Response.json(
      { error: `Período inválido (máximo ${MAX_DAYS} dias).`, code: 'BAD_REQUEST' },
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const { data: emp } = await serviceClient
    .from('users')
    .select('id, company_id')
    .eq('id', employee_id)
    .maybeSingle();

  if (!emp || String(emp.company_id) !== caller.companyId) {
    return Response.json(
      { error: 'Colaborador não encontrado nesta empresa.', code: 'FORBIDDEN' },
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const payload = {
    employee_id,
    company_id: caller.companyId,
    start_date,
    end_date,
  };

  const { data: inserted, error: insErr } = await serviceClient
    .from('jobs')
    .insert({
      company_id: caller.companyId,
      type: JOB_TYPE.CALC_PERIOD,
      status: 'pending',
      payload,
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (insErr || !inserted?.id) {
    return Response.json(
      { error: insErr?.message || 'Falha ao enfileirar job.', code: 'INSERT_FAILED' },
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  return Response.json(
    { job_id: inserted.id },
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
}
