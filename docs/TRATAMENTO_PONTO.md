# Tratamento de Ponto (SmartPonto)

## Visão geral

O sistema implementa tratamento completo de jornada: cálculo automático de horas, horas extras, DSR, banco de horas, ajustes de ponto e fechamento de folha.

## Estrutura de banco

- **time_records** – Marcações (entrada, saída, pausa). Campos: `user_id`, `company_id`, `type`, `created_at`, `source`, `location`.
- **time_adjustments** – Ajustes solicitados/aprovados. Campos: `employee_id`, `user_id`, `company_id`, `date`, `original_time`, `adjusted_time`, `reason`, `approved_by`, `status` (pending/approved/rejected).
- **timesheets** – Folha mensal por funcionário. Campos: `employee_id`, `month`, `year`, `total_worked_hours`, `total_overtime`, `total_night_hours`, `total_absences`, `total_delays`, `dsr_value`, `bank_hours_balance`, `status` (open/closed).
- **bank_hours** – Movimentação de banco de horas: `hours_added`, `hours_removed`, `balance`, `source`.
- **time_balance** – Resumo mensal por usuário (total_hours, extra_hours, debit_hours, final_balance).
- **overtime_rules** – Regras por empresa: `overtime_50`, `overtime_100`, `night_additional`, `dsr_enabled`, `bank_hours_enabled`, `tolerance_minutes`.
- **feriados** – Feriados por empresa (`data`, `descricao`, `type`: national/state/municipal).

## Serviço de processamento

**`src/services/timeProcessingService.ts`**

- **processDailyTime(employeeId, companyId, dateStr, schedule)** – Calcula para um dia: entrada, saída, intervalo, horas trabalhadas, atraso, hora extra, falta, hora noturna.
- **getDayRecords(employeeId, dateStr)** – Marcações do dia.
- **getEmployeeSchedule(employeeId, companyId)** – Jornada (work_shifts + schedules).
- **updateBankHours(employeeId, companyId, dateStr, hoursToAdd, hoursToRemove, source)** – Atualiza banco de horas.
- **closeTimesheet(companyId, month, year)** – Fecha a folha do mês para todos os funcionários da empresa (totais, DSR, saldo banco).
- **validatePunchSequence(records, newType)** – Valida sequência (não duas entradas seguidas, não duas saídas seguidas, intervalo com retorno).

## Regras de cálculo

- **Horas trabalhadas:** saída − entrada − intervalo.
- **Atraso:** entrada_real − entrada_prevista (respeitando tolerância).
- **Hora extra:** se horas_trabalhadas > jornada, diferença; aplicar 50%/100% conforme overtime_rules.
- **Hora noturna:** 22h–05h, adicional conforme regra.
- **Falta:** dia de trabalho sem registro de entrada.
- **DSR:** se DSR habilitado e houver horas extras na semana, média semanal × domingos/feriados.

## Interface admin

- **Funcionários** – `/admin/employees` (jornada, histórico, banco).
- **Espelho de Ponto** – `/admin/timesheet` (dia a dia, entrada, saída, horas extras, atrasos, faltas; botão **Fechar folha**).
- **Ajustes de Ponto** – `/admin/adjustments` (solicitação → aprovação → recálculo).
- **Banco de Horas** – `/admin/bank-hours` (saldo e histórico por funcionário).

## Processamento automático diário

1. **API:** `POST /api/process-daily-time`  
   - Header: `X-Cron-Secret: <CRON_SECRET>`  
   - Variáveis: `VITE_SUPABASE_URL` (ou `SUPABASE_URL`), `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`.

2. **Cron (ex.: 23:59)**  
   - Vercel: em **Settings → Cron Jobs** (ou `vercel.json`), agendar:
     - `0 23 * * *` (todo dia às 23:59) → chamar `POST https://seu-app.vercel.app/api/process-daily-time` com header `X-Cron-Secret`.
   - Ou usar um cron externo (GitHub Actions, etc.) que faça o POST com o secret.

3. O job atualiza `time_balance` (acumula horas do dia no mês). Para lógica completa (extras, DSR, banco), use **Fechar folha** no Espelho de Ponto ao final do mês.

## Validações de ponto

- Primeira batida do dia deve ser **Entrada**.
- Não permitir duas entradas seguidas nem duas saídas seguidas.
- Após **Pausa**, exige **Entrada** (retorno) antes de **Saída**.

Validação aplicada em `src/pages/employee/ClockIn.tsx` antes de inserir em `time_records`.

## Segurança (RLS)

- **time_records:** funcionário vê só os próprios; admin vê os da empresa.
- **time_adjustments:** funcionário vê os próprios; admin pode aprovar/rejeitar (update).
- **timesheets / bank_hours:** funcionário vê os próprios; admin vê os da empresa.
- **overtime_rules:** por company_id.

## Relatórios

- **Espelho de ponto** – Admin Timesheet (exportar PDF/Excel).
- **Horas extras / atrasos / faltas** – Admin Relatórios (tipos: hours, absences, delays, balance).
- **Banco de horas** – Admin Banco de Horas e página do funcionário (Banco de Horas / time-balance).
