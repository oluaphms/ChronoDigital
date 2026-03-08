# Alinhamento: tabelas do banco SmartPonto × páginas do projeto

Este documento compara as tabelas que você listou com o que as **páginas Admin e Funcionário** (SmartPonto) realmente usam e indica o que está errado ou o que deve ser modificado.

---

## Resumo rápido

| Situação | Tabelas |
|----------|---------|
| **Nome ou uso diferente** | `work_schedules` → projeto usa **work_shifts** + **schedules** |
| **Nome com espaço** | `time balance` → deve ser **time_balance** |
| **Relacionamento diferente** | `user_schedules` → projeto usa **schedules** + **users.schedule_id** |
| **Faltando no banco** | **work_shifts**, **schedules**, **system_settings**, **user_settings** |

---

## 1. Tabelas que estão alinhadas (não precisa mudar)

Estas tabelas da sua lista são usadas pelas páginas do projeto com o **mesmo nome** e propósito:

- **absences** – página de faltas
- **audit_logs** – logging
- **companies** – página Admin > Empresa
- **departments** – Admin > Funcionários, Relatórios, etc.
- **devices** – dispositivos
- **employee_invites** – convites
- **notifications** – notificações
- **requests** – solicitações / badges
- **time_adjustments** – ajustes de ponto
- **time_records** – espelho de ponto, registro de ponto, relatórios, monitoramento
- **users** – funcionários, login, perfil (desde que tenham as colunas abaixo)
- **vacations** – férias
- **work_locations** – locais de trabalho

---

## 2. Ajustes de nome ou estrutura

### 2.1 `time balance` → **time_balance**

- **Problema:** Em SQL o nome da tabela não pode ter espaço.
- **Correção:** A tabela deve se chamar **time_balance** (com underscore).
- **Uso no projeto:** Dashboard e página Time Balance (banco de horas por mês).
- **Colunas esperadas:** `id`, `user_id`, `month`, `total_hours`, `extra_hours`, `debit_hours`, `final_balance`, `created_at`, `updated_at` (ver migration `20250307000000_time_balance.sql`).

---

## 3. work_schedules × work_shifts × schedules (principal conflito)

Nas **páginas Admin** (Horários e Escalas) o projeto **não** usa a tabela `work_schedules`. Ele usa duas tabelas:

| Tabela no projeto | Uso nas páginas |
|-------------------|------------------|
| **work_shifts**   | **Admin > Horários** – cadastro de “horários de trabalho” (nome, entrada, saída, intervalo, tolerância). |
| **schedules**     | **Admin > Escalas** – cadastro de “escalas” (nome, dias da semana, vínculo a um `work_shift`). |

Ou seja:

- **work_shifts** = um “tipo de jornada” (ex.: Comercial 8h, 08:00–17:00, 60 min intervalo).
- **schedules** = uma “escala” (ex.: “Escala Comercial”, dias Seg–Sex, usando o horário “Comercial 8h”).

O funcionário tem **uma escala** atribuída: no projeto isso é feito pela coluna **users.schedule_id** (FK para **schedules**), e não por uma tabela `user_schedules` nas telas Admin/Funcionário que estamos alinhando.

### O que fazer no banco

1. **Criar as tabelas que faltam** (se ainda não existirem), conforme a migration `supabase/migrations/20250307100000_smartponto_tables.sql`:
   - **work_shifts** – horários de trabalho (com `company_id`, `name`, `start_time`, `end_time`, `break_duration`, `tolerance_minutes`).
   - **schedules** – escalas (com `company_id`, `name`, `days` (array de dias), `shift_id` referenciando `work_shifts`).

2. **Garantir em `users`:**
   - Coluna **schedule_id** (UUID, FK para `schedules`, opcional), usada em Admin > Funcionários e no perfil do funcionário.

3. **Sobre `work_schedules` e `user_schedules`:**
   - Se no seu banco **work_schedules** é o mesmo conceito que **work_shifts** (só nome diferente), você pode:
     - **Opção A:** Renomear `work_schedules` para `work_shifts` e ajustar estrutura para bater com a migration (recomendado para alinhar 100% com o código).
     - **Opção B:** Manter `work_schedules` e alterar o código do projeto para usar `work_schedules` em vez de `work_shifts` (mais trabalho e risco de confusão com `schedules`).
   - **user_schedules:** o fluxo Admin/Funcionário atual usa **users.schedule_id** + tabela **schedules**. Se você usa `user_schedules` como tabela de vínculo user–escala, essa tabela **não** é usada pelas páginas Admin Escalas/Funcionários nem pelo perfil do funcionário. Pode manter para outro fluxo (ex.: `src/pages/Employees.tsx`), mas para “alinhar com as páginas do projeto” você precisa ter **schedules** e **users.schedule_id**.

---

## 4. Tabelas que o projeto usa e que não estavam na sua lista

Estas tabelas são **necessárias** para as páginas Admin e Funcionário funcionarem como estão no código:

| Tabela | Onde é usada |
|--------|-------------------------------|
| **work_shifts** | Admin > Horários (CRUD) e Admin > Escalas (select “Horário”). |
| **schedules**   | Admin > Escalas (CRUD), Admin > Funcionários (select Escala), employee Perfil (exibir escala). |
| **system_settings** | Admin > Configurações (chave/valor por empresa). |
| **user_settings**   | Funcionário > Configurações (preferências por usuário). |

Estrutura sugerida está em:

- `supabase/migrations/20250307100000_smartponto_tables.sql` (work_shifts, schedules, system_settings, user_settings e colunas em users/companies).

---

## 5. Colunas esperadas nas tabelas principais

Para ficar alinhado com as páginas:

### **users**
- `id` (UUID, = auth.users.id)
- `company_id`
- `department_id` (opcional)
- **schedule_id** (opcional, FK para `schedules`)
- `nome`, `email`, `role`
- `cpf`, `phone`, `position` ou `cargo`, `status` (ex.: active/inactive)
- `avatar`, `preferences` (se usados)
- `created_at`, `updated_at`

### **time_records**
- `id`, `user_id`, **company_id**
- `type` (entrada/saída/pausa), `created_at`
- Demais campos que o app usa (method, photo_url, location, etc.)

### **departments**
- `id`, **company_id**, `name`, etc.

### **companies**
- `id`, `name`, `slug`, `address`, `phone`, `email`, `timezone`, `settings` (se usado), etc.

---

## 6. Checklist de alinhamento

- [ ] Tabela de banco de horas se chama **time_balance** (não “time balance”).
- [ ] Existem as tabelas **work_shifts** e **schedules** (criar ou renomear a partir de work_schedules, conforme decisão acima).
- [ ] Tabela **schedules** tem `company_id`, `name`, `days` (array), `shift_id` (FK para work_shifts).
- [ ] Tabela **work_shifts** tem `company_id`, `name`, `start_time`, `end_time`, `break_duration`, `tolerance_minutes`.
- [ ] **users** tem a coluna **schedule_id** (FK para schedules).
- [ ] Existem **system_settings** (company_id, key, value) e **user_settings** (user_id, key, value).
- [ ] **time_records** tem **company_id** para filtros do admin.
- [ ] **departments** tem **company_id**.

Depois desses ajustes, as páginas Admin (Funcionários, Escalas, Horários, Configurações, etc.) e as páginas do funcionário (Perfil, Configurações, Registrar Ponto, Espelho) ficam alinhadas com o banco.
