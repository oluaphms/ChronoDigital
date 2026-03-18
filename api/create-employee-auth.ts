/**
 * POST /api/create-employee-auth
 * Body: { email: string, password: string, metadata?: object }
 * Header: Authorization: Bearer <jwt do admin>
 *
 * Cria um usuário no Supabase Auth via service_role sem trocar a sessão do admin no client.
 * Também marca email_confirm=true para permitir login imediato.
 *
 * Variáveis de ambiente (Vercel): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e
 * SUPABASE_ANON_KEY (ou VITE_SUPABASE_ANON_KEY) para validar o JWT do admin.
 */

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
    return Response.json(
      { error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' },
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const serviceKey =
    (typeof process.env.SUPABASE_SERVICE_ROLE_KEY === 'string' ? process.env.SUPABASE_SERVICE_ROLE_KEY : '').trim();
  const supabaseUrl = (typeof process.env.SUPABASE_URL === 'string'
    ? process.env.SUPABASE_URL
    : (process.env.VITE_SUPABASE_URL as string) || ''
  )
    .toString()
    .trim()
    .replace(/\/$/, '');
  const anonKey =
    (typeof process.env.SUPABASE_ANON_KEY === 'string'
      ? process.env.SUPABASE_ANON_KEY
      : (process.env.VITE_SUPABASE_ANON_KEY as string) || ''
    ).trim();

  if (!serviceKey || !supabaseUrl) {
    return Response.json(
      { error: 'Configuração indisponível.', code: 'CONFIG_MISSING' },
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const authHeader = request.headers.get('Authorization') || '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!jwt) {
    return Response.json(
      { error: 'Token de autenticação obrigatório.', code: 'UNAUTHORIZED' },
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  let body: { email?: string; password?: string; metadata?: any } = {};
  try {
    const raw = await request.json();
    body = (raw && typeof raw === 'object' ? raw : {}) as typeof body;
  } catch {
    return Response.json(
      { error: 'Body inválido.', code: 'BAD_REQUEST' },
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const metadata = body.metadata && typeof body.metadata === 'object' ? body.metadata : undefined;

  if (!email || !email.includes('@')) {
    return Response.json(
      { error: 'E-mail é obrigatório.', code: 'BAD_REQUEST' },
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
  if (!password || password.trim().length < 6) {
    return Response.json(
      { error: 'Senha inválida (mínimo 6 caracteres).', code: 'BAD_REQUEST' },
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const adminSup = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Verificar se o caller é admin ou hr (validar JWT via Auth REST e depois role em public.users)
    let callerRole: string | null = null;
    if (anonKey) {
      const authRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: { Authorization: `Bearer ${jwt}`, apikey: anonKey },
      });
      if (authRes.ok) {
        const authUser = await authRes.json();
        const callerId = authUser?.id;
        if (callerId) {
          try {
            const byId = await adminSup.from('users').select('role').eq('id', callerId).maybeSingle();
            if (byId?.data?.role) {
              callerRole = String(byId.data.role).toLowerCase();
            } else {
              const byAuthId = await adminSup.from('users').select('role').eq('auth_user_id', callerId).maybeSingle();
              if (byAuthId?.data?.role) callerRole = String(byAuthId.data.role).toLowerCase();
            }
          } catch {
            // ignora falha na coluna auth_user_id ou RLS
          }
        }
      }
    }
    if (callerRole !== 'admin' && callerRole !== 'hr') {
      return Response.json(
        { error: 'Apenas administrador ou RH pode cadastrar funcionário.', code: 'FORBIDDEN' },
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Criar usuário no Auth via API REST do GoTrue (evita problemas com auth.admin no serverless)
    const authApiUrl = `${supabaseUrl.replace(/\/$/, '')}/auth/v1/admin/users`;
    const createRes = await fetch(authApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
      },
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        ...(metadata && Object.keys(metadata).length > 0 ? { user_metadata: metadata } : {}),
      }),
    });

    const createBody = await createRes.json().catch(() => ({}));
    if (!createRes.ok) {
      const errMsg =
        createBody?.msg ?? createBody?.error_description ?? createBody?.message ?? createBody?.error ?? 'Falha ao criar usuário no Auth.';
      return Response.json(
        { error: typeof errMsg === 'string' ? errMsg : 'Falha ao criar usuário no Auth.', code: 'CREATE_FAILED' },
        { status: createRes.status >= 500 ? 500 : 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const userId = createBody?.id ?? createBody?.user?.id;
    if (!userId) {
      return Response.json(
        { error: 'Conta criada mas ID não retornado.', code: 'NO_ID' },
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return Response.json(
      { success: true, userId },
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e: any) {
    const errMsg = e?.message || String(e) || 'Erro interno.';
    return Response.json(
      { error: errMsg, code: 'INTERNAL_ERROR' },
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
}

