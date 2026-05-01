# Go Live - Primeiro Cliente

Checklist de producao para garantir que o sistema esta utilizavel por cliente real no fluxo:
**empresa -> admin -> funcionarios -> ponto -> relatorio**.

Este documento e operacional (passo a passo), com foco em validacao rapida de go-live.

---

## 1) Pre-flight tecnico (obrigatorio)

- [ ] Migracoes Supabase aplicadas sem erro.
- [ ] Variaveis de ambiente corretas em producao (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, chaves de API server-side onde aplicavel).
- [ ] Login funcional para pelo menos 1 admin e 1 colaborador.
- [ ] Hora/Timezone da empresa conferida (`America/Sao_Paulo` ou a do cliente).
- [ ] Backups e runbooks acessiveis (`docs/runbooks/`).

Evidencias recomendadas:
- print de deploy/migration OK
- print de login admin e colaborador
- print de pagina de configuracao da empresa

---

## 2) Checklist funcional (fim a fim)

### 2.1 Criacao de empresa

- [ ] Empresa criada em `companies` com `id`, `nome`, `timezone` e `plan`.
- [ ] Configuracoes minimas preenchidas (`settings`, geofence se exigida pelo cliente).
- [ ] Usuario admin vinculado ao `company_id` correto.

Validacao SQL:

```sql
select id, nome, plan, timezone
from public.companies
where id = '<company_id>';
```

### 2.2 Criacao de usuario admin

- [ ] Usuario existe em `auth.users`.
- [ ] Perfil existe em `public.users` com `role = 'admin'` e `company_id` correto.
- [ ] Admin acessa rotas `/admin/*` sem erro de permissao.

Validacao SQL:

```sql
select id, email, role, company_id
from public.users
where lower(email) = lower('<admin_email>');
```

### 2.3 Cadastro de funcionarios

- [ ] Pelo menos 2 funcionarios (`role = 'employee'`) cadastrados.
- [ ] Funcionarios vinculados ao mesmo `company_id` da empresa.
- [ ] Regras de plano respeitadas (limite de colaboradores, quando aplicavel).

Validacao SQL:

```sql
select role, count(*) as total
from public.users
where company_id = '<company_id>'
group by role;
```

### 2.4 Registro de ponto

- [ ] Colaborador registra jornada completa (entrada -> pausa -> entrada -> saida) sem falhas.
- [ ] Duplicidade bloqueada quando aplicavel.
- [ ] Sequencia invalida bloqueada (ex.: saida sem entrada).
- [ ] Batida aparece em `time_records` com `company_id` e `user_id` corretos.

Referencias:
- trigger de sequencia: `supabase/migrations/20260430180000_time_records_enforce_punch_sequence.sql`
- validacao detalhada: `docs/validacao-fluxo-ponto.md`

Validacao SQL:

```sql
select user_id, type, timestamp, created_at
from public.time_records
where company_id = '<company_id>'
order by created_at desc
limit 30;
```

### 2.5 Geracao de relatorio

- [ ] Relatorio administrativo carrega sem erro.
- [ ] Totais do relatorio batem com os registros de `time_records` para amostra do dia.
- [ ] Exportacoes (se habilitadas para o cliente) geram arquivo valido.

Referencias:
- fluxo tecnico: `docs/fluxo-ponto.md`
- arquitetura UI: `docs/arquitetura-ui.md`

---

## 3) Logs de acoes criticas

Objetivo: garantir rastreabilidade de operacoes sensiveis.

### Minimo exigido para go-live

- [ ] Login bem-sucedido com trilha por tenant (quando ativo): `tenant_audit_log` (ver `src/services/tenantAudit.ts`).
- [ ] Operacoes administrativas sensiveis com auditoria (`audit_logs` via `services/loggingService.ts`).
- [ ] Integracao REP com logs de sync (`rep_logs` via `modules/rep-integration/repService.ts` e `repSyncJob.ts`).
- [ ] Falhas de sincronizacao REP registradas com status de erro.

Consultas de verificacao:

```sql
-- Auditoria por tenant
select tenant_id, user_id, action, created_at
from public.tenant_audit_log
where tenant_id = '<company_id>'
order by created_at desc
limit 20;
```

```sql
-- Logs REP (quando cliente usa REP)
select company_id, acao, status, mensagem, created_at
from public.rep_logs
where company_id = '<company_id>'
order by created_at desc
limit 20;
```

---

## 4) Erros e mensagens para utilizacao real

Objetivo: nada de "erro desconhecido" sem contexto.

- [ ] Fluxos principais mostram mensagem clara para utilizador (ex.: permissao, validacao de sequencia, dados obrigatorios).
- [ ] Logs internos guardam detalhe tecnico para suporte (codigo SQL/API quando existir).
- [ ] Erros genericos residuais mapeados para mensagens amigaveis nas telas criticas.

Casos minimos para testar manualmente:

- [ ] tentativa de batida invalida (saida sem entrada)
- [ ] tentativa de cadastro sem campos obrigatorios
- [ ] tentativa de acesso admin por colaborador
- [ ] falha de sync REP (simulada) gera log e retorno compreensivel

---

## 5) Seed de teste (obrigatorio antes do primeiro cliente)

Script recomendado:
- `supabase/seed_go_live_primeiro_cliente.sql`

O que o seed cria:
- empresa de teste (`comp_golive_primeiro_cliente`)
- 1 admin + 2 colaboradores (a partir de `auth.users`)
- batidas de teste em `time_records`
- evento de auditoria de aplicacao do seed (quando `tenant_audit_log` existir)

### Ordem de execucao

1. Criar 3 usuarios no Supabase Auth:
   - `admin.golive@pontowebdesk.local`
   - `colaborador1.golive@pontowebdesk.local`
   - `colaborador2.golive@pontowebdesk.local`
2. Executar `supabase/seed_go_live_primeiro_cliente.sql`.
3. Validar retorno da query final do seed.
4. Executar checklist funcional (secao 2).

---

## 6) Criterio de aceite (go/no-go)

Go-live aprovado apenas se:

- [ ] checklist funcional (secao 2) = 100% OK
- [ ] logs criticos (secao 3) com evidencias validas
- [ ] erros principais com mensagens claras (secao 4)
- [ ] seed executado e dados de teste conferidos (secao 5)
- [ ] sem bloqueador aberto de severidade alta para o cliente

Se qualquer item falhar: **NO-GO**, corrigir e revalidar.

---

## 7) Matriz de aderência técnica (CLT + Portaria 671)

Status de referência para o checklist técnico de produção.

| Requisito | Status | Evidência |
|-----------|--------|-----------|
| `employees`, `work_shifts`, `employee_shift_schedule`, `punches`, `time_adjustments`, `bank_hours`, `audit_logs` | **OK** | Migrações em `supabase/migrations/` (`20250308150000_*`, `20250320000000_*`, `20260417200000_*`, `20250319000000_*`, `20250321000000_*`). |
| `timesheet_closures` com assinatura (`signed_by_employee`, `signed_at`) | **OK (novo)** | `supabase/migrations/20260501150000_clt_portaria671_foundation.sql`. |
| Bloqueio de edição após fechamento mensal | **OK (novo)** | Trigger `tr_time_records_block_after_closure` na migração `20260501150000_*`. |
| `time_entries` como camada interpretada | **OK (compat)** | View `public.time_entries` criada em `20260501150000_*` (derivada de `time_records`). |
| Imutabilidade de batidas / Portaria 671 | **OK** | Trigger `prevent_update_delete_time_records` + hash/NSR em `20250321000000_rep_portaria_671.sql`. |
| Funções `add_hours`, `consume_hours`, `expire_hours` | **OK (novo)** | Criadas em `20260501150000_*`. |
| Auditoria com campos padronizados (`entity`, `before`, `after`, `timestamp`, `ip`) | **OK (compat)** | `audit_logs` padronizada + trigger de sync em `20260501150000_*`. |
| Motor de interpretação por escala (`interpret_punch_by_schedule`) | **OK** | `20260417210000_*` / `20260420010000_*`. |
| Funções nomeadas `calculate_worked_hours` / `validate_labor_rules` | **PARCIAL** | Cálculo e validações existem em `src/engine/timeEngine.ts` e `src/services/timeProcessingService.ts`, com nomes internos diferentes. |
| Fechamento em PDF + JSON de espelho/relatórios | **OK** | Exportação em `src/services/professionalPDF.service.ts` e endpoints/serviços de relatório. |

### Checklist de verificação pós-migração (obrigatório)

- [ ] Executar migrações até `20260501150000_clt_portaria671_foundation.sql`.
- [ ] Validar fechamento de mês por colaborador (admin) e tentativa de inserção pós-fechamento (deve bloquear).
- [ ] Validar assinatura de fechamento (`signed_by_employee`, `signed_at`).
- [ ] Validar funções `add_hours`, `consume_hours`, `expire_hours` no SQL Editor.
- [ ] Validar inserção em `audit_logs` com campos legados e padronizados.

