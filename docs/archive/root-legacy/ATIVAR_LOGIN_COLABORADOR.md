# Ativar login de colaborador já cadastrado

Quando um colaborador aparece na tabela de funcionários mas **não consegue logar** (erro "Usuário ou senha incorreto" ou 400 no login), em geral ele foi cadastrado ou importado **antes** da rota `/api/auth-admin` (ação create-user) estar ativa. Nesse caso o registro existe em `public.users`, mas **não** em `auth.users`, então o Supabase Auth rejeita o login.

## Como corrigir (um colaborador)

1. **Criar o usuário no Supabase Auth**
   - Acesse o [Supabase](https://supabase.com/dashboard) → seu projeto → **Authentication** → **Users**.
   - Clique em **Add user** → **Create new user**.
   - Preencha:
     - **Email**: o mesmo e-mail do colaborador (ex.: `paulohmorais@hotmail.com`).
     - **Password**: a senha que ele deve usar (ex.: `123456`).
   - Marque **Auto Confirm User** (ou depois confirme o e-mail manualmente).
   - Salve.

2. **Copiar o ID do usuário criado**
   - Na lista de Users, clique no usuário que acabou de criar.
   - Copie o **User UID** (UUID).

3. **Vincular na tabela `public.users`**
   - No Supabase, vá em **SQL Editor** e execute (substitua os valores):

```sql
UPDATE public.users
SET auth_user_id = 'COLE_AQUI_O_USER_UID_DO_PASSO_2'
WHERE email = 'email_do_colaborador@exemplo.com';
```

   - Exemplo:
```sql
UPDATE public.users
SET auth_user_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
WHERE email = 'paulohmorais@hotmail.com';
```

4. **Testar**
   - O colaborador deve conseguir entrar em **Entrar → Entre como Colaborador** com o e-mail e a senha definida no passo 1.

## Para novos cadastros e importações

Com as variáveis de ambiente configuradas na Vercel (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`) e a rota `/api/auth-admin` ativa, **novos** colaboradores (cadastrados manualmente ou importados) já passam a ter conta no Auth e conseguem logar normalmente. Colaboradores importados **sem senha na planilha** usam a senha provisória **123456**. (A API única `auth-admin` concentra as ações confirm-email, set-password e create-user para respeitar o limite de 12 Serverless Functions do plano Hobby.)
