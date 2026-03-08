# Colunas esperadas pelo projeto (schema)

Comparação entre o que o seu banco tem e o que o código usa. Só está listado onde há diferença ou onde é crítico.

---

## time_balance (ajuste necessário)

| Seu banco (atual)   | Código espera        | Ação |
|---------------------|----------------------|------|
| balance_date        | —                    | Não usado pelo código |
| hours_credit        | **extra_hours**      | Migration adiciona `extra_hours` e copia de `hours_credit` |
| hours_debit         | **debit_hours**      | Migration adiciona `debit_hours` e copia de `hours_debit` |
| balance             | **final_balance**    | Migration adiciona `final_balance` e copia de `balance` |
| month               | month                | OK |
| —                   | **total_hours**      | Migration adiciona (default 0) |
| —                   | **updated_at**       | Migration adiciona |

**O que fazer:** rodar a migration `20250307200000_align_time_balance_columns.sql` no Supabase (SQL Editor). Assim o Dashboard e a página Time Balance passam a usar a mesma tabela sem mudar o código.

---

## Demais tabelas (conferido com o que você enviou)

- **absences** – id, user_id, absence_date, type, reason, created_at → OK.
- **audit_logs** – id, timestamp, severity, action, user_id, company_id, details, etc. → OK (loggingService usa esses campos).
- **companies** – id, name, nome, slug, address, phone, email, timezone, settings, ... → OK (Admin Empresa usa principalmente name, address, phone, email, timezone).
- **departments** – id, company_id, name, manager_id, created_at, updated_at → OK.
- **devices** – id, company_id, name, device_identifier, status, created_at → OK.
- **employee_invites** – id, email, role, token, company_id, ... → OK.
- **notifications** – id, user_id, type, title, message, read, created_at, action_url, metadata → OK.
- **requests** – id, user_id, type, description, status, approved_by, created_at → OK.
- **schedules** – id, company_id, name, days, shift_id, created_at, updated_at → OK.
- **system_settings** – id, company_id, key, value, created_at, updated_at → OK.
- **time_adjustments** – id, user_id, time_record_id, reason, status, approved_by, created_at → OK.
- **time_records** – você enviou parte das colunas; o código usa também **created_at**, **photo_url**, e opcionalmente justification, ip_address, device_id, location. Vale garantir que existam pelo menos: id, user_id, company_id, type, method, created_at (e photo_url se o registro com foto for usado).
- **user_settings** – id, user_id, key, value → OK (estrutura típica).
- **users** – o código espera: id, company_id, department_id, **schedule_id**, nome, email, role, cpf, phone, cargo (ou position), status, avatar, preferences, created_at, updated_at. Confirme se **schedule_id** existe (UUID, FK para schedules).
- **vacations**, **work_locations**, **work_shifts** – não foi enviado o detalhe das colunas; pelo fluxo atual estão OK desde que work_shifts tenha company_id, name, start_time, end_time, break_duration, tolerance_minutes.

---

## Resumo

1. **Só mudança obrigatória:** tabela **time_balance** – rodar a migration que adiciona e preenche `total_hours`, `extra_hours`, `debit_hours`, `final_balance` e `updated_at`.
2. **Conferir:** em **users** existe a coluna **schedule_id** (FK para `schedules`).
3. **Conferir:** em **time_records** existem **created_at** e **photo_url** (e o que mais o registro de ponto usar).

Depois disso, o schema fica alinhado com as páginas do projeto.
