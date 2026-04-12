import { createClient } from '@supabase/supabase-js';

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

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const searchParams = new URL(request.url).searchParams;
  const companyId = searchParams.get('companyId') || undefined;
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));
  const offset = (page - 1) * limit;

  // Get total count for pagination metadata
  const countQuery = supabase
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'employee');

  if (companyId) {
    countQuery.eq('company_id', companyId);
  }

  const { count, error: countError } = await countQuery;
  if (countError) {
    return Response.json({ error: countError.message }, { status: 500, headers: corsHeaders });
  }

  // Get paginated data
  let query = supabase
    .from('users')
    .select('id, nome, email, cpf, department_id, schedule_id, estrutura_id, status, company_id')
    .eq('role', 'employee')
    .order('nome', { ascending: true })
    .range(offset, offset + limit - 1);

  if (companyId) {
    query = query.eq('company_id', companyId);
  }

  const { data, error } = await query;
  if (error) {
    return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
  }

  const totalPages = Math.ceil((count || 0) / limit);
  return Response.json(
    {
      employees: data ?? [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    },
    { status: 200, headers: corsHeaders }
  );
}

