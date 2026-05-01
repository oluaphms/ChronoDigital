# Auditoria do SaaS (produção)

**Data de referência:** auditoria baseada no código em `d:\PontoWebDesk` (revisão estática).  
**Metodologia:** leitura de `services/tenantPlan.service.ts`, páginas admin, `modules/rep-integration/repApiRoutes.ts`, `api/*.ts`, migrações RLS/multi-tenant. Não substitui pentest nem revisão de políticas RLS linha a linha no Supabase.

---

## 1. OK (sólido)

### Planos e limites (UI + caminhos principais)

- **`services/tenantPlan.service.ts`** centraliza `normalizeTenantPlan`, `getMaxEmployeesForPlan`, `evaluateEmployeeSeat`, `isPlanFeatureEnabled` (`rep_afd_import`, `rep_fiscalizacao`, `rep_devices`).
- **`src/hooks/useTenantPlan.ts`** carrega plano + contagem de colaboradores ativos via `fetchCompanyPlan` / `countActiveEmployeesForCompany`.
- **`src/pages/admin/Employees.tsx`** chama `fetchCompanyPlan`, `countActiveEmployeesForCompany`, `evaluateEmployeeSeat` antes de criar colaborador e antes de confirmar importação em lote; desativa ações e mostra `PlanUpgradePanel` quando não há vaga.
- **`src/services/importEmployeesService.ts`** importa dinamicamente o serviço de plano e valida `evaluateEmployeeSeat` antes do insert em lote.
- Criação na UI de colaboradores usa `db.insert('users', …)` **depois** das validações acima (fluxo em `Employees.tsx`).

### Features por plano (UI)

- **`ImportRep.tsx`:** `isPlanFeatureEnabled(..., 'rep_afd_import')` — Free vê só upgrade.
- **`RepDevices.tsx`:** `rep_devices` + efeitos que **não** carregam lista/employees se Free; botões do cabeçalho só se plano ok.
- **`Fiscalizacao.tsx`:** `rep_fiscalizacao` — conteúdo condicionado.

### Multi-tenant (modelo de dados)

- Isolamento no Postgres assenta em **`company_id`** (e colunas **`tenant_id`** geradas como espelho em `20260403200000_multi_tenant_tenant_id_rls_audit.sql`). Não há “um único `tenant_id` em todas as queries” no app: o padrão é **`company_id`** + RLS com `get_my_company_id()` / equivalente.
- **`handleImportAfd`** em `repApiRoutes.ts` exige utilizador **admin/hr** e **`company_id` alinhado ao `users.company_id`** do token (linhas 560–567), reduzindo importação cross-tenant por utilizador normal.

### Documentação geral

- **`README.md`** e **`docs/overview.md`** descrevem Supabase como stack, `VITE_SUPABASE_*`, estrutura `src/` e migrações — alinhados ao uso real (`App.tsx`, `services/supabaseClient`, etc.).
- **`docs/database.md`** cobre a maioria das tabelas criadas em `CREATE TABLE` nas migrações e aponta `supabase/migrations/` como fonte de verdade.

---

## 2. RISCOS (problemas reais)

### 2.1 Plano: backend não replica todas as regras da UI

| Risco | Evidência |
|-------|-----------|
| **Importação AFD (`POST /api/rep/import-afd`)** | `handleImportAfd` valida token, papel admin/hr e `company_id`, mas **não** consulta `companies.plan` nem `isPlanFeatureEnabled`. Um tenant **Free** pode contornar o bloqueio da UI chamando o endpoint com sessão válida. |
| **Limite de colaboradores no convite** | `api/employee-invite.ts` (aceite) cria utilizador + linha em `users` com **service role** e **não** chama `evaluateEmployeeSeat`. Convites podem ultrapassar o limite do plano. |
| **`services/adminUserService.ts`** | `createEmployee` não verifica plano. Após a consolidação do admin em **`/admin/*`** (portal com `AdminLayout`), **não há import** deste serviço noutros `.ts/.tsx` (código morto / risco futuro se alguém voltar a ligar sem validação). |
| **Sincronização REP (`POST /api/rep/sync`)** | Autenticação por **`API_KEY`** apenas; **sem** checagem de plano. Quem possui a chave sincroniza dispositivos (escopo `company_id` opcional na query). Não é “bypass Free” pelo browser, mas **não há gate de produto** no servidor. |
| **Agente / batida (`POST /api/rep/punch`)** | Mesmo padrão: **API_KEY** + `service_role`; sem plano. Esperado para integração, mas **não** amarra monetização. |

### 2.2 Multi-tenant: APIs com service role / chave

| Risco | Evidência |
|-------|-----------|
| **`api/employees.ts` (GET)** | Com `API_KEY` válida, se **`companyId` não for passado**, a query conta/lista utilizadores `role=employee` **sem filtro de empresa** → potencial **vazamento cross-tenant massivo** se a chave vazar ou for mal usada. |
| **Credenciais** | Rotas que usam `SUPABASE_SERVICE_ROLE_KEY` ou `API_KEY` ignoram RLS; a segurança depende **inteiramente** de validação manual no handler e de segredo das chaves. |

### 2.3 RLS e superfície Supabase

- O cliente web usa **anon + JWT**; o isolamento depende das **políticas RLS** aplicadas no projeto. Esta auditoria **não** reproduziu todas as políticas em runtime.
- **`repCorsHeaders`** comenta que origens não listadas ainda podem receber CORS permissivo em alguns casos — superfície a endurecer em produção estrita.

### 2.4 Documentação `docs/database.md`

- Tabelas criadas fora do padrão `CREATE TABLE IF NOT EXISTS public.*` (ex.: `timesheets_daily` / `payroll_summaries` sem prefixo explícito no ficheiro de migração) podem divergir do inventário mental; **`employee_invites`** vem de migração com `create table` minúsculo — está referida no doc, mas **não** há garantia de 100% de cobertura sem script automatizado.
- **`supabase_full_schema.sql`** na raiz pode estar **desatualizado** em relação às migrações (já assinalhado no próprio `docs/database.md`).

---

## 3. CRÍTICOS (podem quebrar produção ou negócio)

1. **`GET /api/employees` sem `companyId` + `API_KEY`:** exposição de dados de **todas** as empresas — **crítico** para confidencialidade multi-tenant se a chave não for ultra-restrita e monitorizada.
2. **`POST /api/rep/import-afd` sem validação de plano:** **bypass direto** da política comercial “Free não importa AFD” para qualquer admin/hr autenticado.
3. **Aceite de convite sem limite de licenças:** **bypass** do limite de colaboradores do plano Free/Pro.

*(“Quebrar produção” no sentido de **integridade comercial e LGPD**: o site pode continuar online enquanto limites e isolamento falham.)*

---

## 4. Ações recomendadas

### Prioridade alta

1. **`handleImportAfd`:** após validar admin/hr e `company_id`, ler `companies.plan` (service role) e aplicar a mesma lógica que `isPlanFeatureEnabled(..., 'rep_afd_import')`; responder **403** se Free.
2. **`api/employee-invite` (accept):** antes do insert final, contar colaboradores ativos + `evaluateEmployeeSeat` (ou RPC única no Postgres com `SECURITY DEFINER`).
3. **`api/employees.ts`:** tornar **`companyId` obrigatório** ou, se omitido, retornar **400** (nunca listar global); alternativa: restringir a um único tenant configurado por env.

### Prioridade média

4. **`POST /api/rep/sync`:** opcionalmente verificar plano Pro+ antes de `syncRepDevices`, ou documentar que esta rota é **apenas** para jobs internos e nunca exposta a tenants.
5. **Dead code:** remover ou documentar `adminUserService` se não for usado, para evitar reintrodução de criação de users sem quota.
6. **Supabase:** revisão dedicada de **RLS** em `users`, `rep_devices`, `time_records`, `employee_invites` com checklist por papel (admin/hr/employee).

### Prioridade baixa / manutenção

7. Script CI que lista `CREATE TABLE` nas migrações e compara com `docs/database.md`.
8. Endurecer CORS REP em produção conforme comentários em `repVercelAuth.ts`.

---

## 5. Critério de aceite (pedido pelo projeto)

| Critério | Estado após auditoria |
|----------|------------------------|
| Nenhum furo de plano | **Não atendido:** import AFD e convites contornam limites/features no backend. |
| Nenhum vazamento de tenant | **Parcial:** RLS protege o cliente; **API `employees` sem `companyId`** é vazamento crítico se a `API_KEY` for usada em integração. |

---

## 6. Referências de código (trechos relevantes)

- Plano / features: `services/tenantPlan.service.ts`
- Import AFD (sem plano): `modules/rep-integration/repApiRoutes.ts` — função `handleImportAfd` (~linhas 490–590)
- Employees API: `api/employees.ts` — `companyId` opcional (~linhas 49–80)
- Sync REP: `modules/rep-integration/repApiRoutes.ts` — `handleSync` (~373–405)
- Convite: `api/employee-invite.ts` — insert em `users` sem quota (~170–186)
