# Solução: Timeout ao Carregar Perfil de Usuário no Login

## Problema
```
[Auth] Perfil em public.users demorou ou indisponível; 
usando dados mínimos do Auth. Próxima sincronização pode 
preencher empresa e permissões.
```

## Causa
Há múltiplas políticas RLS conflitantes na tabela `public.users` que causam timeout ao tentar ler o perfil durante o login.

## Solução

### Passo 1: Aplicar a Migração no Supabase

1. Acesse https://supabase.com/dashboard
2. Selecione seu projeto
3. Vá para **SQL Editor**
4. Clique em **New Query**
5. Copie e cole o conteúdo de `supabase/migrations/20260411000009_fix_users_rls_timeout.sql`
6. Clique em **Run**

### Passo 2: Verificar se Funcionou

1. Limpe o cache do navegador (Ctrl+Shift+Delete)
2. Recarregue a página (F5)
3. Tente fazer login novamente
4. Verifique o console (F12 → Console)
5. O aviso de timeout não deve mais aparecer

## O que a Migração Faz

1. **Remove todas as políticas RLS conflitantes** da tabela `users`
2. **Recria a função `get_my_company_id()`** como SECURITY DEFINER (evita recursão)
3. **Cria políticas RLS simples e eficientes**:
   - Usuário vê seu próprio perfil
   - Usuário vê qualquer usuário da mesma empresa
   - Admin/HR pode atualizar/deletar usuários da empresa

## Resultado Esperado

Após aplicar a migração:
- ✅ Login funciona sem timeout
- ✅ Perfil carrega rapidamente
- ✅ Empresa e permissões são preenchidas corretamente
- ✅ Admin/HR conseguem gerenciar usuários

## Se Ainda Não Funcionar

1. Verifique se a migração foi executada com sucesso (sem erros)
2. Limpe o cache do Vercel (ver LIMPAR_CACHE_VERCEL.md)
3. Faça um novo deploy
4. Limpe o cache do navegador novamente
5. Tente fazer login

## Arquivo da Migração
- `supabase/migrations/20260411000009_fix_users_rls_timeout.sql`
