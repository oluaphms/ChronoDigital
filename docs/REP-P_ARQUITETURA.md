# Arquitetura – SmartPonto REP-P

## 1. Stack

- **Frontend:** React + Vite, TypeScript
- **Backend / Banco:** Supabase (PostgreSQL, Auth, RLS)
- **Deploy:** Vercel (frontend e API serverless)
- **Portaria:** 671/2021 (REP-P)

## 2. Módulos principais

### 2.1 Registro de ponto (REP-P)

- **`src/rep/repEngine.ts`**
  - `registerPunch()`: chama a RPC `rep_register_punch` no Supabase.
  - A RPC (no banco) atribui NSR, calcula hash (SHA-256) e `previous_hash`, insere em `time_records` e em `point_receipts`.
  - `validateIntegrity()`: valida sequência NSR e cadeia de hash por empresa.
  - Helpers para AFD/AEJ (formatação de linhas e conteúdo).

### 2.2 Banco de dados (Supabase)

- **`time_nsr_sequence`**  
  Por empresa: `company_id`, `current_nsr`, `updated_at`. Usado para gerar o próximo NSR.

- **`time_records`**  
  Campos adicionais REP-P: `nsr`, `hash`, `previous_hash`, `timestamp`, `source`.  
  Triggers: `prevent_update_time_records`, `prevent_delete_time_records` (bloqueiam UPDATE/DELETE).

- **`point_receipts`**  
  Comprovante por marcação: `time_record_id`, `company_id`, `user_id`, `nsr`, `receipt_data` (JSONB).

- **`audit_logs`**  
  Auditoria: `user_id`, `action`, `table`, `record_id`, `old_data`, `new_data`, `created_at`, `ip`.

- **Função `rep_register_punch`**  
  RPC que: valida usuário, obtém próximo NSR, último `previous_hash`, calcula hash, insere `time_records` e `point_receipts`, retorna id, nsr, hash, timestamp, receipt_id.

### 2.3 Sincronização de hora

- **`src/services/timeSync.ts`**
  - Comparação com hora de referência (ex.: API World Time).
  - Tolerância de 30 segundos (Portaria).
  - Funções para exibição em horário de Brasília.

### 2.4 Exportação fiscal

- **`/api/export/afd`** (GET)  
  Retorna TXT (AFD): NSR, data, hora, CPF, tipo. Autenticação: Bearer (JWT Supabase).

- **`/api/export/aej`** (GET)  
  Retorna JSON (AEJ): registros do período e resumo (horas trabalhadas, extras, faltas). Autenticação: Bearer.

### 2.5 UI

- **Registro de ponto:** `src/pages/employee/ClockIn.tsx`, `src/pages/TimeClock.tsx` → usam `registerPunch()` do `repEngine`.
- **Fiscalização:** `src/pages/admin/Fiscalizacao.tsx` → exportação AFD/AEJ e validação de integridade.
- **Espelho de ponto:** `src/pages/admin/Timesheet.tsx`, `src/pages/employee/Timesheet.tsx`. Registros com NSR (REP-P) não têm edição/exclusão direta.

## 3. Fluxo de uma marcação

1. Usuário clica em Entrada/Saída/Pausa na tela de registro.
2. Frontend chama `registerPunch()` → `supabase.rpc('rep_register_punch', ...)`.
3. RPC (SECURITY DEFINER):
   - Garante que `auth.uid()` = `p_user_id`.
   - Obtém próximo NSR em `time_nsr_sequence` (lock).
   - Lê último `hash` da empresa em `time_records`.
   - Calcula `hash = sha256(user_id|timestamp|nsr|previous_hash)`.
   - Insere em `time_records` (id, user_id, company_id, type, method, nsr, hash, previous_hash, timestamp, …).
   - Atualiza `time_nsr_sequence.current_nsr`.
   - Insere em `point_receipts` (dados mínimos do comprovante).
   - Retorna { id, nsr, hash, previous_hash, timestamp, receipt_id }.
4. Frontend atualiza a UI (última marcação, etc.).

## 4. Integridade

- **NSR:** sequencial por empresa, sem lacunas (controlado na RPC).
- **Hash:** cada registro inclui `hash` e `previous_hash`; `validateIntegrity()` recalcula o hash esperado e compara.
- **Imutabilidade:** triggers impedem UPDATE/DELETE em `time_records`; correções via `time_adjustments`.

## 5. Segurança

- RLS nas tabelas (usuário vê apenas própria empresa / próprios registros conforme perfil).
- RPC `rep_register_punch` só permite registrar ponto para o próprio usuário (`auth.uid() = p_user_id`).
- APIs de exportação exigem JWT Supabase (Bearer).
