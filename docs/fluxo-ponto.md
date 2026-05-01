# Fluxo de Ponto

Visão de produto: **`docs/overview.md`**. Este documento mapeia **caminhos de código** até `time_records`, RPCs e tabelas satélite.

Documentação derivada **somente** do código do repositório. O corpo exato das funções SQL no Supabase (RPCs) não está neste repositório em ficheiros TS; onde a persistência ocorre via RPC, isso está indicado explicitamente.

---

## 1. Entrada

### 1.1 Web — portal do colaborador (`/employee/clock`)

| Item | Detalhe |
|------|---------|
| **Arquivo** | `src/pages/employee/ClockIn.tsx` |
| **Função** | `executePunchRegistration` (registro após comprovação: foto, WebAuthn ou manual permitido) |
| **Chamada de persistência** | `registerPunchSecure` importado de `src/rep/repEngine.ts` |

Fluxo resumido no mesmo arquivo: validação de sequência do dia (`validatePunchSequence` de `src/services/timeProcessingService.ts`), regras de GPS/área (`getCompanyLocations`, `isWithinAllowedLocation`), upload de foto (`uploadPunchPhotoWithRetry`), antifraude cliente (`validatePunch` em `src/security/antiFraudEngine.ts`), depois `registerPunchSecure` com `fraudScore` / `fraudFlags`.

### 1.2 Web — fluxo legado com `useRecords` (ex.: `App.tsx`)

| Item | Detalhe |
|------|---------|
| **Hook** | `src/hooks/useRecords.ts` — função `addRecord` |
| **Ramo A** | Se `canUseSecurePunch(method, data)` for verdadeiro: `registerPunchSecure` (`src/rep/repEngine.ts`). |
| **Ramo B** | Caso contrário: `PontoService.registerPunch` (`services/pontoService.ts`). |

A UI de comprovação antiga usa `components/PunchModal.tsx` (callback `onConfirm` costuma acionar o fluxo que leva a `addRecord` no `App.tsx`).

### 1.3 API — agente / relógio intermediário (`POST /api/punch`)

| Item | Detalhe |
|------|---------|
| **Arquivo** | `api/punch.ts` |
| **Função exportada** | `default async function handler(request: Request)` |

Dois formatos de corpo:

1. **Lote (agente)** — schema Zod `RequestSchema`: `deviceId`, `companyId`, `punches[]`. Após validar dispositivo na tabela configurável por `process.env.SUPABASE_DEVICES_TABLE` (padrão `devices`), monta linhas e faz **upsert** na tabela `process.env.SUPABASE_TIME_LOGS_TABLE` ou padrão **`clock_event_logs`** (`normalizeEventType` para `event_type`).
2. **Legado single** — `SinglePunchSchema`: chama `sendPunch` de `src/services/sendPunch.service.ts`, que faz **`insert` na tabela `punches`** (não `time_records`).

O cliente que chama esta API no repositório: `agent/adapters/apiPunch.adapter.ts` (`createApiPunchAdapter` → `fetch(.../api/punch)`).

### 1.4 API — REP / integrador (`POST` com slug `punch`)

| Item | Detalhe |
|------|---------|
| **Entrada HTTP** | `api/rep-bridge.ts` → `handleRepSlug` em `modules/rep-integration/repApiRoutes.ts` |
| **Função** | `handlePunch` |
| **Processamento** | `ingestPunch` em `modules/rep-integration/repService.ts` → RPC Supabase **`rep_ingest_punch`** com `company_id`, `data_hora`, identificadores (`pis`, `cpf`, `matricula`), `tipo_marcacao`, `nsr`, etc. |

Autenticação neste handler: `API_KEY` ou `REP_API_KEY` (Bearer / header), conforme o próprio arquivo.

### 1.5 REP — leitura do hardware (sem gravar na mesma requisição)

| Item | Detalhe |
|------|---------|
| **Arquivo** | `modules/rep-integration/repApiRoutes.ts` |
| **Função** | `handlePunches` — **GET** — `getPunchesFromDeviceServer` |
| **Uso** | Retorna marcações do equipamento; a gravação no banco ocorre em fluxos separados (ex.: sync que chama `ingestPunchesFromDevice`). |

### 1.6 REP — job de sincronização

| Item | Detalhe |
|------|---------|
| **Arquivo** | `modules/rep-integration/repSyncJob.ts` |
| **Função** | `syncRepDevice` (e cadeia que usa `ingestPunchesFromDevice`) |
| **Serviço** | `ingestPunchesFromDevice` em `modules/rep-integration/repService.ts` — cada marcação via `ingestPunch` → RPC **`rep_ingest_punch`**. |

### 1.7 Promoção `clock_event_logs` → espelho

| Item | Detalhe |
|------|---------|
| **Arquivo** | `src/services/clockEventPromote.service.ts` |
| **Função** | `promoteClockEventsToEspelho` |
| **Chamada** | Para cada evento não promovido, RPC **`rep_ingest_punch`** (via `restRpc`), depois PATCH na tabela de logs para marcar `promoted_at` / erros. |

Quem invoca: `src/services/sync.service.ts`, `agent/services/queueFlush.service.ts`.

---

## 2. Processamento

### 2.1 `registerPunchSecure` / `registerPunch` (app → Supabase)

| Arquivo | `src/rep/repEngine.ts` |
| **Funções** | `registerPunchSecure` (RPC `rep_register_punch_secure`; se erro código `42883`, fallback para `registerPunch` com RPC `rep_register_punch`) |
| **Validação no cliente** | `ensureUuidLike` para `user_id` antes da RPC; timeout `withTimeout` (`src/utils/withTimeout.ts`). |
| **Normalização de tipo** | Parâmetro `p_type` como string (ex. `entrada`, `saída`, `pausa`) vindo do chamador (`ClockIn` mapeia `LogType` → `typeStr`). |

Ajuste de horário “de negócio” após a inserção não aparece nestas funções TS; fica na implementação SQL da RPC.

### 2.2 `PontoService.registerPunch` (caminho alternativo)

| Arquivo | `services/pontoService.ts` |
| **Função** | `registerPunch` |
| **Validações** | `ValidationService.validateSequence`, `validateTimeInterval`, `validateLocation` (geofence da empresa), flag manual → `FraudFlag.MANUAL_BYPASS`. |
| **Horário** | `const serverTime = new Date()` usado em `createdAt` do objeto `TimeRecord` montado em memória. |

### 2.3 `saveTimeRecord` (persistência após `PontoService` via Supabase)

| Arquivo | `services/firestoreService.ts` (**nome legado do ficheiro**; implementação = **Supabase**, não Firestore) |
| **Função** | `saveTimeRecord` |
| **Ordem** | Tenta RPC `insert_time_record_for_user` com parâmetros mapeados; se função inexistente (`42883`), `db.insert('time_records', supabaseData)`. |
| **Mapeamento** | `timeRecordToSupabase` no mesmo arquivo: `id`, `user_id`, `company_id`, `type`, `method`, `location`, `photo_url`, `validated`, `fraud_score`, `adjustments`, `created_at`, `updated_at`. |

### 2.4 API `/api/punch` (lote)

| Arquivo | `api/punch.ts` |
| **Função** | `normalizeEventType` — normaliza strings de tipo de evento (entrada/saída/pausa/batida e letras E/S/P/B). |
| **Validação** | Zod nos schemas; validação de `devices` ativo e `company_id`; JSON parse. |

### 2.5 `ingestPunch` (REP / AFD / API rep)

| Arquivo | `modules/rep-integration/repService.ts` |
| **Função** | `ingestPunch` — repassa parâmetros à RPC `rep_ingest_punch`, inclusive `p_only_staging`, `p_apply_schedule`, `p_force_user_id`. |
| **AFD** | `ingestAfdRecords` ajusta ISO com `afdRecordToIsoDateTime` quando há `timezone` (`repParser.ts`). |

---

## 3. Persistência

### 3.1 Tabela `time_records`

**Inserção direta (código TS visível):**

- `services/firestoreService.ts` — `db.insert('time_records', supabaseData)` ou RPC `insert_time_record_for_user`.
- `src/pages/admin/RepDevices.tsx` — `client.from('time_records').insert({ id, user_id, company_id, type, method: 'rep', timestamp, source: 'rep', nsr, fraud_score: 0, is_late: false })` quando não existe `targetTimeRecordId` (consolidação a partir de `rep_punch_logs`).

**Inserção indireta (RPC no banco — nome fixo no app):**

- `rep_register_punch` / `rep_register_punch_secure` (`src/rep/repEngine.ts`) — o retorno inclui `id`, `nsr`, `hash`, `timestamp`, etc.; o app trata `result.id` como identificador do registro (ex.: `savePunchEvidence` em `ClockIn.tsx`).
- `rep_ingest_punch` (`modules/rep-integration/repService.ts`, `repApiRoutes.ts`, `clockEventPromote.service.ts`) — retorno pode incluir `time_record_id` (consumido em `handlePunch`).

### 3.2 Tabela `clock_event_logs` (nome padrão)

| Arquivo | `api/punch.ts` |
| **Operação** | `supabase.from(timeLogsTable).upsert(rows, { onConflict: 'dedupe_hash', ignoreDuplicates: true })` |
| **Campos montados** | `employee_id`, `occurred_at`, `event_type`, `device_id`, `company_id`, `dedupe_hash`, `raw` (com metadados `_ingested_via`, `_ingested_at`), `source: 'clock'`, `created_at`. |

### 3.3 Tabela `punches`

| Arquivo | `src/services/sendPunch.service.ts` |
| **Função** | `sendPunch` — `supabase.from('punches').insert(row)` com `source` default `PUNCH_SOURCE_WEB` (`src/constants/punchSource.ts`). |

Usado pelo corpo legado de `api/punch.ts` (ramo `SinglePunchSchema`).

### 3.4 Fila REP

O código descreve marcações em **`rep_punch_logs`** antes do espelho (comentários e queries em `src/pages/admin/RepDevices.tsx`, `modules/rep-integration/repService.ts`). A consolidação usa RPCs nomeados no TS (`rep_ingest_punch`, `promotePendingRepPunchLogs`, etc.).

---

## 4. Saída

### 4.1 Lista / histórico recente do usuário

| Consumo | `src/hooks/useRecords.ts` |
| **Query** | `timeRecordsQueries.getRecordsByUser` em `services/queryOptimizations.ts` — `from('time_records').select('id, user_id, type, method, created_at, location, company_id')...` |
| **Realtime** | Subscription `postgres_changes` em **`time_records`** INSERT filtrado por `company_id` para invalidar `['records', userId]`. |

### 4.2 Tela “Registrar ponto” (colaborador)

| Arquivo | `src/pages/employee/ClockIn.tsx` |
| **Leitura do dia** | `getDayRecords` em `src/services/timeProcessingService.ts` — `db.select('time_records', ...)` por `user_id` e faixa de `created_at` do dia local. |

### 4.3 App legado (`App.tsx`)

Mesmo hook `useRecords` para lista; registro pode ir por `addRecord` → `registerPunchSecure` ou `PontoService.registerPunch`.

### 4.4 Relatórios / admin

Exemplos localizados no código que leem `time_records`:

- `src/pages/admin/PontoDiario.tsx` — `db.select('time_records', ...)`
- `src/pages/admin/ArquivosFiscais.tsx` — `db.select('time_records', ...)`
- `src/pages/TimeRecords.tsx` — `db.select('time_records', ...)`

O espelho de ponto e utilitários de espelho (`src/utils/timesheetMirror.ts`, páginas `Timesheet`) consomem dados de jornada derivados de registros — seguir imports a partir desses arquivos para cada relatório específico.

### 4.5 Evidências pós-batida (portal)

| Arquivo | `src/services/punchEvidenceService.ts` (funções `savePunchEvidence`, `createFraudAlertsForFlags` chamadas em `ClockIn.tsx`) |
| **Referência** | Usa `timeRecordId: result.id` retornado por `registerPunchSecure`. |

---

## 5. Problemas encontrados

1. **Dois produtos de “batida web” com destinos diferentes:** `registerPunch*` usa RPCs `rep_register_punch*`; `PontoService.registerPunch` usa `insert_time_record_for_user` ou insert em **`time_records`**; a API legado `/api/punch` single usa **`punches`**; o lote `/api/punch` usa **`clock_event_logs`**. Não há um único caminho de persistência no código.

2. **Nome legado `firestoreService.ts`:** o ficheiro persiste em **Supabase** apenas; um *rename* futuro do módulo reduziria confusão (documentado em **`docs/overview.md`**).

3. **`timeRecordToSupabase` vs RPC `insert_time_record_for_user`:** o objeto montado por `timeRecordToSupabase` não inclui todos os campos que a RPC lista (`p_source`, `p_latitude`, …); o código usa `supabaseData.source` etc., que podem ser `undefined` se `TimeRecord` não populá-los — dependência do comportamento default no SQL.

4. **`PontoService.registerPunch` contém valores fixos** (`ipAddress: '189.121.22.45'`, `deviceInfo` estático) no trecho atual de `services/pontoService.ts` — ruído para auditoria/antifraude se esse caminho for usado em produção.

5. ~~**README vs implementação:**~~ **Atualizado:** `README.md` e **`docs/overview.md`** descrevem **Supabase** como stack oficial; manter diagramas e código alinhados a RPC/`time_records`.

6. **RPCs não versionadas no repo neste mapeamento:** regras exatas de escrita em `time_records` vs apenas `rep_punch_logs` para `rep_ingest_punch` estão no banco; o TS só passa flags (`p_only_staging`, `p_apply_schedule`).

7. **`/api/rep/punches` (GET)** só **lê** o relógio; quem espera gravar ponto apenas com essa rota não encontrará insert no handler dessa URL.

---

## Diagrama lógico (arquivos)

```
[ClockIn.tsx] ──registerPunchSecure──► [repEngine.ts] ──RPC──► rep_register_punch_secure
[useRecords.addRecord] ──┬── registerPunchSecure ──► repEngine.ts
                         └── PontoService.registerPunch ──► firestoreService.saveTimeRecord (Supabase) ──► time_records / RPC insert_time_record_for_user

[agent apiPunch.adapter] ──POST──► [api/punch.ts] ──┬── clock_event_logs (batch)
                                                    └── sendPunch ──► punches (legacy body)

[api/rep-bridge] ──handlePunch──► [repService.ingestPunch] ──RPC──► rep_ingest_punch
[repSyncJob] ──ingestPunchesFromDevice──► rep_ingest_punch

[clockEventPromote.service] ──► rep_ingest_punch ──► (espelho; marca clock_event_logs)

[UI lista] ◄── timeRecordsQueries / useRecords ◄── time_records
[ClockIn estado do dia] ◄── getDayRecords ◄── time_records
```
