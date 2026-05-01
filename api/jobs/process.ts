/**
 * POST /api/jobs/process
 * Worker: processa jobs pendentes (cron ou JWT admin/RH).
 * Headers: X-Cron-Secret (cron) **ou** Authorization: Bearer (admin/hr).
 */

import { createClient } from '@supabase/supabase-js';
import { processJobs } from '../../src/services/jobs/processJobs';
import { getCallerContext, isAdminOrHr } from '../_shared/callerContext';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Cron-Secret',
};

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

  const supabaseUrlForAuth = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '')
    .toString()
    .trim()
    .replace(/\/$/, '');
  const anonKey = (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim();

  const secret = request.headers.get('X-Cron-Secret')?.trim();
  const cronSecret = (process.env.CRON_SECRET || process.env.VITE_CRON_SECRET || '').trim();
  let cronOk = false;
  if (cronSecret && secret === cronSecret) {
    cronOk = true;
  }

  const authHeader = request.headers.get('Authorization') || request.headers.get('authorization') || '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!cronOk) {
    if (!jwt || !anonKey) {
      return Response.json(
        { error: 'Unauthorized', code: 'UNAUTHORIZED' },
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    const preClient = createClient(supabaseUrlForAuth, (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim(), {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const caller = await getCallerContext(supabaseUrlForAuth, anonKey, preClient, jwt);
    if (!caller || !isAdminOrHr(caller.role)) {
      return Response.json(
        { error: 'Unauthorized', code: 'UNAUTHORIZED' },
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
  }

  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '')
    .toString()
    .trim()
    .replace(/\/$/, '');
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!serviceKey || !supabaseUrl) {
    return Response.json(
      { error: 'Supabase não configurado.', code: 'CONFIG_MISSING' },
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const out = await processJobs(supabase, 3);
    return Response.json(
      { ok: true, processed: out.ran, last_job_id: out.lastJobId, errors: out.errors },
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json(
      { error: message, code: 'PROCESS_ERROR' },
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
}
