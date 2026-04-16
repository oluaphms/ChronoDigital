/**
 * Autenticação para rotas /api/rep/* (proxy do relógio).
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { RepDevice } from './types';
import { mergeHubProviderIntoRepDevice } from './repHubMerge';
import { getServiceRoleKeyResolved, getSupabaseAnonKeyResolved, getSupabaseUrlResolved } from './repVercelEnv';

const JSON_HDR = { 'Content-Type': 'application/json' };

export function repCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin');
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export function getServiceSupabase(): { admin: SupabaseClient } | null {
  const url = getSupabaseUrlResolved();
  const serviceKey = getServiceRoleKeyResolved();
  if (!url || !serviceKey) return null;
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return { admin };
}

function getBridgeToken(): string {
  return (
    process.env.REP_BRIDGE_TOKEN ||
    process.env.REP_AGENT_TOKEN ||
    process.env.API_KEY ||
    ''
  ).trim();
}

async function authenticateWithServiceRole(
  admin: SupabaseClient,
  request: Request,
  deviceId: string
): Promise<{ device: RepDevice } | Response> {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: JSON_HDR });
  }

  const bridgeToken = getBridgeToken();

  if (bridgeToken && token === bridgeToken) {
    const { data: device, error } = await admin.from('rep_devices').select('*').eq('id', deviceId).maybeSingle();
    if (error || !device) {
      return Response.json({ error: 'Dispositivo não encontrado' }, { status: 404, headers: JSON_HDR });
    }
    return { device: await mergeHubProviderIntoRepDevice(admin, device as RepDevice) };
  }

  const { data: authData, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !authData.user) {
    return Response.json({ error: 'Token inválido' }, { status: 401, headers: JSON_HDR });
  }

  const { data: profile, error: pErr } = await admin
    .from('users')
    .select('company_id, role')
    .eq('id', authData.user.id)
    .maybeSingle();

  if (pErr || !profile?.company_id) {
    return Response.json({ error: 'Perfil não encontrado' }, { status: 403, headers: JSON_HDR });
  }

  const { data: device, error: dErr } = await admin.from('rep_devices').select('*').eq('id', deviceId).maybeSingle();
  if (dErr || !device) {
    return Response.json({ error: 'Dispositivo não encontrado' }, { status: 404, headers: JSON_HDR });
  }

  if (device.company_id !== profile.company_id) {
    return Response.json({ error: 'Acesso negado' }, { status: 403, headers: JSON_HDR });
  }

  const role = String(profile.role || '').toLowerCase();
  if (!['admin', 'hr'].includes(role)) {
    return Response.json({ error: 'Sem permissão para integração REP' }, { status: 403, headers: JSON_HDR });
  }

  return { device: await mergeHubProviderIntoRepDevice(admin, device as RepDevice) };
}

async function authenticateWithUserJwt(deviceId: string, jwt: string): Promise<{ device: RepDevice } | Response> {
  const url = getSupabaseUrlResolved();
  const anon = getSupabaseAnonKeyResolved();
  if (!url || !anon) {
    return Response.json(
      {
        error:
          'Servidor sem SUPABASE_SERVICE_ROLE_KEY e sem VITE_SUPABASE_ANON_KEY. ' +
          'Adicione SUPABASE_SERVICE_ROLE_KEY ao .env ou garanta VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY.',
      },
      { status: 500, headers: JSON_HDR }
    );
  }

  const bridgeToken = getBridgeToken();
  if (bridgeToken && jwt === bridgeToken) {
    return Response.json(
      {
        error:
          'Autenticação por API_KEY no proxy REP exige SUPABASE_SERVICE_ROLE_KEY no servidor. ' +
          'Use login no app (JWT) em desenvolvimento sem service role.',
      },
      { status: 503, headers: JSON_HDR }
    );
  }

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: authData, error: authErr } = await userClient.auth.getUser();
  if (authErr || !authData.user) {
    return Response.json({ error: 'Token inválido' }, { status: 401, headers: JSON_HDR });
  }

  const { data: device, error: dErr } = await userClient.from('rep_devices').select('*').eq('id', deviceId).maybeSingle();
  if (dErr || !device) {
    return Response.json({ error: 'Dispositivo não encontrado' }, { status: 404, headers: JSON_HDR });
  }

  const { data: profile, error: pErr } = await userClient
    .from('users')
    .select('company_id, role')
    .eq('id', authData.user.id)
    .maybeSingle();

  if (pErr || !profile?.company_id) {
    return Response.json({ error: 'Perfil não encontrado' }, { status: 403, headers: JSON_HDR });
  }

  if (device.company_id !== profile.company_id) {
    return Response.json({ error: 'Acesso negado' }, { status: 403, headers: JSON_HDR });
  }

  const role = String(profile.role || '').toLowerCase();
  if (!['admin', 'hr'].includes(role)) {
    return Response.json({ error: 'Sem permissão para integração REP' }, { status: 403, headers: JSON_HDR });
  }

  return { device: await mergeHubProviderIntoRepDevice(userClient, device as RepDevice) };
}

export async function authenticateRepDeviceRequest(
  request: Request,
  deviceId: string | null
): Promise<{ device: RepDevice } | Response> {
  try {
    if (!deviceId) {
      return Response.json({ error: 'device_id é obrigatório' }, { status: 400, headers: JSON_HDR });
    }

    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      return Response.json({ error: 'Unauthorized' }, { status: 401, headers: JSON_HDR });
    }

    const ctx = getServiceSupabase();
    if (ctx) {
      return await authenticateWithServiceRole(ctx.admin, request, deviceId);
    }

    return await authenticateWithUserJwt(deviceId, token);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[repAuth] authenticateRepDeviceRequest', e);
    return Response.json(
      { error: 'Falha na autenticação REP', details: msg },
      { status: 500, headers: JSON_HDR }
    );
  }
}
