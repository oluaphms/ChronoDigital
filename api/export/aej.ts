/**
 * GET /api/export/aej
 * Exporta AEJ (Arquivo Eletrônico de Jornada) - Portaria 671.
 * Header: Authorization: Bearer <Supabase JWT>
 * Query: company_id (opcional), month, year (opcional, padrão mês/ano atual)
 */

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
    const month = url.searchParams.get('month');
    const year = url.searchParams.get('year');

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

    const now = new Date();
    const y = year ? parseInt(year, 10) : now.getFullYear();
    const m = month ? parseInt(month, 10) : now.getMonth() + 1;
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 0, 23, 59, 59);
    const startIso = start.toISOString();
    const endIso = end.toISOString();

    const { data: records } = await sup
      .from('time_records')
      .select('id, nsr, timestamp, created_at, user_id, type')
      .eq('company_id', targetCompanyId)
      .gte('created_at', startIso)
      .lte('created_at', endIso)
      .not('nsr', 'is', null)
      .order('nsr', { ascending: true });

    const { data: users } = await sup
      .from('users')
      .select('id, cpf, nome')
      .eq('company_id', targetCompanyId);

    const cpfByUserId: Record<string, string> = {};
    (users || []).forEach((u: any) => { cpfByUserId[u.id] = u.cpf || ''; });

    const list = (records || []) as any[];
    const registros = list.map((r: any) => {
      const ts = r.timestamp || r.created_at;
      const d = ts ? new Date(ts) : new Date();
      return {
        nsr: r.nsr,
        data: d.toISOString().slice(0, 10),
        hora: d.toTimeString().slice(0, 8),
        cpf: (cpfByUserId[r.user_id] || '').replace(/\D/g, ''),
        tipo: r.type,
        user_id: r.user_id,
      };
    });

    const { data: timesheets } = await sup
      .from('timesheets')
      .select('employee_id, total_worked_hours, total_overtime, total_absences')
      .eq('company_id', targetCompanyId)
      .eq('month', m)
      .eq('year', y);

    let totalHorasTrabalhadas = 0;
    let totalHorasExtras = 0;
    let totalFaltas = 0;
    (timesheets || []).forEach((t: any) => {
      totalHorasTrabalhadas += Number(t.total_worked_hours) || 0;
      totalHorasExtras += Number(t.total_overtime) || 0;
      totalFaltas += Number(t.total_absences) || 0;
    });

    const body = JSON.stringify(
      {
        versao: '1.0',
        geradoEm: new Date().toISOString(),
        periodo: { mes: m, ano: y },
        resumo: {
          totalHorasTrabalhadas,
          totalHorasExtras,
          totalFaltas,
        },
        registros,
      },
      null,
      2
    );

    return new Response(body, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="AEJ_${targetCompanyId}_${y}-${String(m).padStart(2, '0')}.json"`,
      },
    });
  } catch (e: any) {
    return Response.json(
      { error: e?.message || 'Erro ao gerar AEJ' },
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}
