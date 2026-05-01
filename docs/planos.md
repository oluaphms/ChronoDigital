# Planos SaaS e monetização

Documento de referência para **planos por empresa**, **gates de funcionalidade** no cliente e **variáveis de ambiente** relacionadas com upgrade e contacto comercial.

---

## Modelo de plano

- O plano da empresa está em **`companies.plan`**, tipicamente: `free` \| `pro` \| `enterprise`.
- A lógica de normalização, limites de colaboradores e chaves de funcionalidade está em **`services/tenantPlan.service.ts`** (`normalizeTenantPlan`, `getMaxEmployeesForPlan`, `evaluateEmployeeSeat`, `isPlanFeatureEnabled`, tipo `PlanFeatureKey`).
- A UI usa **`src/hooks/useTenantPlan.ts`** e componentes como **`PlanUpgradePanel`** (ex.: página **`/admin/plan`**).

**Importante:** regras mostradas na UI devem ser **replicadas no servidor** (RLS, triggers, validação em `api/*`) onde a segurança do negócio o exija. Ver **`docs/auditoria-sistema.md`** para riscos conhecidos (endpoints com service role sem gate de plano).

---

## Variáveis `VITE_*` (frontend / Vite)

Definidas em `.env`, `.env.local` ou no painel de deploy. Só variáveis prefixadas com **`VITE_`** são expostas a `import.meta.env`.

### Upgrade, faturação e contacto comercial

| Variável | Uso |
|----------|-----|
| `VITE_UPGRADE_URL` | URL principal do botão **Fazer upgrade** (`PlanUpgradePanel`, `/admin/plan`). Se vazio, usa `VITE_BILLING_URL` ou a rota interna `/admin/plan`. |
| `VITE_BILLING_URL` | URL alternativa de faturação/checkout; fallback quando `VITE_UPGRADE_URL` não está definida. |
| `VITE_SALES_EMAIL` | E-mail de contacto comercial na página de planos. Valor por omissão no código pode ser `comercial@seudominio.com.br` se não estiver definido. |

### Funcionalidades condicionadas ao plano

Exemplos de gates em código: importação **AFD** ficheiro, fiscalização avançada, página **Relógios REP** (`rep_devices`, `rep_afd_import`, `rep_fiscalizacao`, etc.). Lista canónica: **`PlanFeatureKey`** em `tenantPlan.service.ts`.

### Outras variáveis do projeto

Supabase (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`), URL da app, Gemini opcional, etc. — ver **`.env.local.example`** / **`.env.example`** na raiz e **`CONFIGURAR_SUPABASE.md`**.

---

## Documentos relacionados

- **`docs/auditoria-sistema.md`** — checagens de plano vs APIs.
- **`docs/database.md`** — tabela `companies` e tenants.
- **`docs/overview.md`** — visão geral do sistema.
