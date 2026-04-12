# Solução: Sistema Muito Lento + Erro 403 em Notificações

## Problemas Identificados

1. **Erro 403 ao acessar notificações** - RLS está bloqueando
2. **Timeout ao carregar dados (28s)** - Supabase está lento
3. **Sistema muito lento em geral** - RLS em muitas tabelas

## Causa Raiz

RLS (Row Level Security) está habilitado em muitas tabelas e causando:
- Queries lentas (RLS adiciona overhead)
- Timeouts ao carregar dados
- Erro 403 em notificações

## Solução

Aplicar 2 migrações para otimizar performance:

### Migração 1: Corrigir RLS de Notificações

1. Acesse https://supabase.com/dashboard
2. Vá para **SQL Editor** → **New Query**
3. Copie e cole: `supabase/migrations/20260411000011_fix_notifications_rls_403.sql`
4. Clique em **Run**

### Migração 2: Desabilitar RLS em Tabelas Públicas

1. Vá para **SQL Editor** → **New Query**
2. Copie e cole: `supabase/migrations/20260411000012_optimize_rls_performance.sql`
3. Clique em **Run**

## O que as Migrações Fazem

**Migração 1:**
- Remove políticas RLS conflitantes de notificações
- Recria políticas simples e eficientes
- Resolve erro 403

**Migração 2:**
- Desabilita RLS em tabelas que contêm dados públicos:
  - Departments, Companies, Shifts, Schedules
  - Holidays, Job_titles, Cities, States
  - Requests, Logging, etc.
- Mantém RLS em tabelas sensíveis:
  - users (já desabilitado)
  - time_records (dados pessoais)
  - notifications (dados pessoais)

## Resultado Esperado

Após aplicar as migrações:
- ✅ Notificações carregam sem erro 403
- ✅ Sistema muito mais rápido
- ✅ Sem timeouts ao carregar dados
- ✅ Login funciona instantaneamente

## Próximos Passos

1. Aplique as 2 migrações
2. Limpe o cache do navegador (Ctrl+Shift+Delete)
3. Recarregue a página (F5)
4. Teste todas as funcionalidades

## Se Ainda Estiver Lento

1. Verifique se as migrações foram executadas com sucesso
2. Limpe o cache do Vercel (ver LIMPAR_CACHE_VERCEL.md)
3. Faça um novo deploy
4. Aguarde 5-10 minutos para o Vercel processar

## Arquivos das Migrações
- `supabase/migrations/20260411000011_fix_notifications_rls_403.sql`
- `supabase/migrations/20260411000012_optimize_rls_performance.sql`
