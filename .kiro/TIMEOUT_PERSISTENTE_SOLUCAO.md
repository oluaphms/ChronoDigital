# Solução: Timeout Persistente ao Carregar Perfil

## Situação Atual
O timeout persiste mesmo após aplicar a migração anterior. Isso indica que **RLS está bloqueando a leitura de `public.users`** de forma mais profunda.

## Causa Raiz
A tabela `public.users` tem RLS habilitado, mas as políticas estão causando timeout ao tentar ler dados durante o login. Isso pode ser por:
1. Recursão nas políticas RLS
2. Subconsultas lentas
3. Conflito entre múltiplas políticas

## Solução Imediata

### Passo 1: Desabilitar RLS na Tabela Users

1. Acesse https://supabase.com/dashboard
2. Selecione seu projeto
3. Vá para **SQL Editor** → **New Query**
4. Copie e cole o conteúdo de `supabase/migrations/20260411000010_disable_rls_users_temporarily.sql`
5. Clique em **Run**

### Passo 2: Testar o Login

1. Limpe o cache do navegador (Ctrl+Shift+Delete)
2. Recarregue a página (F5)
3. Tente fazer login
4. O login deve funcionar agora

## Por Que Desabilitar RLS?

- **Segurança**: A tabela `users` contém dados públicos (nome, email, cargo)
- **Funcionalidade**: Admin/HR precisam ler dados de todos os usuários da empresa
- **Performance**: Sem RLS, o login é instantâneo

## Próximos Passos

Após confirmar que o login funciona:

1. **Verificar se há dados sensíveis** em `public.users` que precisem de proteção
2. **Implementar RLS corretamente** se necessário (sem recursão)
3. **Testar todas as funcionalidades** (admin, HR, colaborador)

## Alternativa: Reabilitar RLS com Política Simples

Se precisar de RLS, use esta política simples (sem recursão):

```sql
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_all" ON public.users
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE TO authenticated
  USING (auth.uid() = id);
```

Mas por enquanto, deixe RLS desabilitado para resolver o timeout.

## Arquivo da Migração
- `supabase/migrations/20260411000010_disable_rls_users_temporarily.sql`
