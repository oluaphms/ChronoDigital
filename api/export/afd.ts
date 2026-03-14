/**
 * GET /api/export/afd
 * Exporta AFD (Arquivo Fonte de Dados) para fiscalização - Portaria 671.
 * Header: Authorization: Bearer <Supabase JWT>
 * Query: company_id (opcional, para admin multi-empresa)
 */

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function formatAfdLine(
  record: { nsr: number; timestamp?: string; created_at: string; user_id: string; type: string },
  cpf: string
): string {
  const ts = record.timestamp || record.created_at;
  const d = ts ? new Date(ts) : new Date();
  const data = d.toISOString().slice(0, 10).replace(/-/g, '');
  const hora = d.toTimeString().slice(0, 8).replace(/:/g, '');
  const cpfNorm = (cpf || '').replace(/\D/g, '').padStart(11, '0').slice(0, 11);
  const tipo = (record.type || 'E').slice(0, 1).toUpperCase();
  return `${String(record.nsr).padStart(9, '0')}\t${data}\t${hora}\t${cpfNorm}\t${tipo}`;
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (request.method !== 'GET') {
    return Response.json(
      { error: 'Method not allowed' },
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return Response.json(
      { error: 'Authorization Bearer obrigatório' },
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').toString().trim().replace(/\/$/, '');
  const anonKey = (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim();
  if (!anonKey || !supabaseUrl) {
    return Response.json(
      { error: 'Supabase não configurado' },
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const sup = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });

    const { data: { user } } = await sup.auth.getUser(token);
    if (!user) {
      return Response.json(
        { error: 'Token inválido ou expirado' },
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const url = new URL(request.url);
    const companyId = url.searchParams.get('company_id');

    let targetCompanyId = companyId;
    if (!targetCompanyId) {
      const { data: profile } = await sup.from('users').select('company_id').eq('id', user.id).single();
      targetCompanyId = (profile as any)?.company_id;
    }
    if (!targetCompanyId) {
      return Response.json(
        { error: 'Empresa não identificada' },
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: records } = await sup
      .from('time_records')
      .select('id, nsr, timestamp, created_at, user_id, type')
      .eq('company_id', targetCompanyId)
      .not('nsr', 'is', null)
      .order('nsr', { ascending: true });

    const { data: users } = await sup
      .from('users')
      .select('id, cpf')
      .eq('company_id', targetCompanyId);

    const cpfByUserId: Record<string, string> = {};
    (users || []).forEach((u: any) => { cpfByUserId[u.id] = u.cpf || ''; });

    const list = (records || []) as any[];
    const header = 'NSR\tDATA\tHORA\tCPF\tTIPO';
    const lines = list.map((r) => formatAfdLine(r, cpfByUserId[r.user_id] || ''));
    const body = [header, ...lines].join('\r\n');

    return new Response(body, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="AFD_${targetCompanyId}_${new Date().toISOString().slice(0, 10)}.txt"`,
      },
    });
  } catch (e: any) {
    return Response.json(
      { error: e?.message || 'Erro ao gerar AFD' },
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}
