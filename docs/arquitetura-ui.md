# Arquitetura da interface (frontend)

Visão de produto e stack: **`docs/overview.md`**. Planos e gates na UI: **`docs/planos.md`**.

## Admin: `AdminLayout` + React Router

- **Shell canónico para administradores e RH:** `src/layouts/AdminLayout.tsx` → delega para `components/Layout.tsx` com `layoutVariant="admin"`, envolvendo as rotas em `App.tsx` sob `/admin/*`.
- **Navegação:** páginas lazy em `src/routes/portalLazyPages.tsx` / `src/routes/routeChunks.ts`, com guards (`ProtectedRoute`, `RoleGuard`).

Isto é o caminho suportado para novas funcionalidades e correções.

## Legado removido

- O painel administrativo monolítico por abas (**`AdminView`**, ficheiro em `components/`) foi **removido**. O fluxo atual em `App.tsx` envia o separador **Admin** para **`/admin/dashboard`** (portal com **`AdminLayout`**).
- Novas funcionalidades administrativas: sempre rotas em **`/admin/*`** e páginas em **`src/pages/admin/`**.

## `EmployeeLayout`

- Análogo ao admin: `src/layouts/EmployeeLayout.tsx` para rotas `/employee/*`.

## Documentos relacionados

- `docs/overview.md` — o que o sistema faz e para quem.
- `docs/database.md` — modelo de dados Supabase.
- `docs/planos.md` — planos e variáveis de billing.
- `README.md` — início rápido e índice da documentação.
