/**
 * GET /api/jobs/:id
 * Estado do job (polling). Requer JWT de admin/RH da mesma empresa.
 */

import { createClient } from '@supabase/supabase-js';
import { getCallerContext, isAdminOrHr } from '../_shared/callerContext';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (request.method !== 'GET') {
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

  const url = new URL(request.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  const jobId = pathParts[pathParts.length - 1];
  if (!jobId || jobId === 'jobs') {
    return Response.json(
      { error: 'ID do job inválido.', code: 'BAD_REQUEST' },
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
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

  const { data: job, error } = await serviceClient
    .from('jobs')
    .select('id, company_id, type, status, payload, result, attempts, created_at, updated_at')
    .eq('id', jobId)
    .maybeSingle();

  if (error) {
    return Response.json(
      { error: error.message, code: 'QUERY_FAILED' },
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
  if (!job) {
    return Response.json(
      { error: 'Job não encontrado.', code: 'NOT_FOUND' },
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
  if (String(job.company_id) !== caller.companyId) {
    return Response.json(
      { error: 'Acesso negado.', code: 'FORBIDDEN' },
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  return Response.json(job, { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
