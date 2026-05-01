# Visão geral do PontoWebDesk / SmartPonto

Leitura orientada para **novo developer**: em cerca de **10 minutos** ficas com mapa mental do produto, utilizadores, stack e onde aprofundar.

---

## O que o sistema faz

**PontoWebDesk** (marca de produto **SmartPonto** no código e documentação) é uma aplicação **web / PWA** para:

- **Registo de ponto** (entrada, intervalo, saída) com regras de sequência, evidências (foto, GPS quando aplicável) e conformidade com práticas de **REP** (Registrador Eletrónico de Ponto) e Portaria **671/2021** onde o modelo se aplica.
- **Espelho de ponto**, tratamento de horas, escalas, pedidos (férias, ausências, ajustes) e áreas de **administração / RH** e **colaborador**.
- **Integração com relógios / AFD / APIs** de ponto (módulo `modules/rep-integration`), sincronização e filas (`rep_punch_logs`, `rep_logs`).

A **fonte de verdade** dos dados de negócio é **PostgreSQL** no **Supabase** (tabelas em `public.*`, autenticação `auth.users`, **RLS** por `company_id` / tenant).

---

## Para quem é

| Público | Na aplicação | Notas |
|--------|----------------|--------|
| **Empresa (tenant)** | Uma linha em `companies` com plano (`free` / `pro` / `enterprise`), regras e limites. | Multi-tenant por `company_id`. |
| **Administrador / RH** | Rotas **`/admin/*`**, shell `AdminLayout` — colaboradores, relatórios, REP, planos, configurações. | Papel `admin` ou `hr` em `public.users.role`. |
| **Colaborador** | Rotas **`/employee/*`**, shell `EmployeeLayout` — registo de ponto, pedidos, espelho. | Utilizador autenticado ligado à empresa. |
| **Integrações / agente** | APIs serverless em `api/` (ex.: batida em lote, bridge REP) com chaves e **service role** onde documentado. | Não expor segredos no browser. |

---

## Como funciona (arquitetura resumida)

### Stack

- **Frontend:** React 18 + TypeScript + **Vite**; rotas e lazy loading em `src/routes/`.
- **Backend de dados:** **Supabase** (Postgres + Auth + Storage). Cliente em `src/services/supabaseClient.ts` / `services/supabaseClient.ts` e políticas nas migrações `supabase/migrations/`.
- **Funções SQL / RPC:** registo seguro de ponto (`rep_register_punch*`), ingestão REP (`rep_ingest_punch`), triggers (ex.: sequência de batidas, limites de plano quando aplicável).

### Fluxo mental «batida → banco → relatório»

1. **Batida:** UI (`ClockIn`, portal admin) ou integração chama RPC / insert em `time_records` (ou filas `rep_punch_logs` antes de promover).
2. **Banco:** Postgres grava e aplica RLS + triggers; duplicados e sequência inválida são tratados conforme migrações e `docs/validacao-fluxo-ponto.md`.
3. **Relatório / espelho:** páginas e utilitários leem `time_records` (e tabelas relacionadas); espelho lógico em `src/utils/timesheetMirror.ts` — ver `docs/fluxo-ponto.md`.

### Pastas úteis no repositório

```
src/pages/admin/     # Portal administrativo
src/pages/employee/  # Portal do colaborador
src/layouts/         # AdminLayout, EmployeeLayout
services/            # Plano tenant, integrações, clientes partilhados
supabase/migrations/ # Esquema versionado (fonte de verdade)
api/                 # Handlers serverless (Vercel, etc.)
docs/                # Documentação de produto e técnica
```

---

## Onde ir a seguir

| Documento | Conteúdo |
|-----------|-----------|
| **`README.md`** | Início rápido, scripts, requisitos. |
| **`docs/database.md`** | Tabelas, relações, multi-tenant. |
| **`docs/arquitetura-ui.md`** | Shell admin/employee, rotas, legado removido. |
| **`docs/planos.md`** | Planos SaaS, variáveis `VITE_*` de billing, gates. |
| **`docs/fluxo-ponto.md`** | Todos os caminhos de escrita/leitura de batidas. |
| **`docs/validacao-fluxo-ponto.md`** | Garantias de consistência (duplicados, ordem, REP). |
| **`CONFIGURAR_SUPABASE.md`** | Variáveis de ambiente e projeto Supabase. |

---

## O que *não* é arquitetura atual

- **Firebase / Firestore** como backend principal: o produto está em **Supabase**. Podem existir ficheiros ou nomes legados no código (ex.: `firestoreService.ts` como camada Supabase); não uses documentação antiga na raiz que fale em Firebase como caminho oficial.
- **Painel monolítico `AdminView`:** removido; o admin canônico é **`/admin/*`** com `AdminLayout` (descrito em `docs/arquitetura-ui.md`).

Notas antigas que estavam na raiz foram movidas para **`docs/archive/root-legacy/`** (mantêm-se pesquisáveis no Git); **não** são documentação ativa — use **`docs/`** e **`README.md`**.
