# Configuração Centralizada — Agente Local

## Arquivos

```
agent/config/
├── env.ts         # Validação fail-fast de variáveis críticas
├── env.test.ts    # Testes de validação
└── index.ts       # Agregador de config (usa env.ts)
```

## Filosofia: Fail Fast

O agente **NUNCA** inicia com configuração inválida ou incompleta.

```
┌─────────────────────────────────────┐
│         loadAgentConfig()           │
│              inicia                 │
└─────────────────────────────────────┘
            │
            ▼
    ┌───────────────┐
    │   env.ts      │
    │  validateEnv()│
    └───────────────┘
            │
    ┌───────┴───────┐
    │               │
    ▼               ▼
SUPABASE_URL   SUPABASE_SERVICE_ROLE_KEY
  válida?          válida?
    │               │
   SIM              SIM
    │               │
    └───────┬───────┘
            │
            ▼
    ┌───────────────┐
    │  continua     │
    │  execução    │
    └───────────────┘
            │
           NÃO (qualquer um)
            │
            ▼
    ┌───────────────┐
    │  console.error│
    │  process.exit │
    │     (1)       │
    └───────────────┘
```

## Variáveis Obrigatórias

### Modo Direto (REST ao Supabase)
```env
SUPABASE_URL=https://xxxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIs...
```

### Modo API Intermediária
```env
CLOCK_AGENT_API_URL=https://seu-app.vercel.app
CLOCK_AGENT_API_KEY=sua-chave-api
# Supabase ainda é necessário para leitura de devices e espelho
SUPABASE_URL=https://xxxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIs...
```

## Validações

### SUPABASE_URL
- ✅ Deve começar com `https://`
- ✅ Deve conter `.supabase.co`
- ✅ Hostname deve terminar com `.supabase.co`
- ❌ HTTP rejeitado
- ❌ Domínios não-Supabase rejeitados

### SUPABASE_SERVICE_ROLE_KEY
- ✅ Mínimo 50 caracteres
- ✅ Deve conter `.` (formato JWT)
- ❌ Valores vazios/curtos rejeitados

## Mensagens de Erro

### URL Ausente
```json
{"level":"error","scope":"env","message":"Variável obrigatória ausente: SUPABASE_URL (ou VITE_SUPABASE_URL)","at":"2024-01-15T10:30:00.000Z"}
```
Console adicional:
```
[ENV ERROR] Configure SUPABASE_URL no .env ou .env.local
```

### URL Inválida
```json
{"level":"error","scope":"env","message":"SUPABASE_URL inválida: https://invalid...","at":"2024-01-15T10:30:00.000Z"}
```
Console adicional:
```
[ENV ERROR] A URL deve ser HTTPS e terminar com .supabase.co
[ENV ERROR] Exemplo: https://xxxxxx.supabase.co
```

### Service Role Key Ausente
```json
{"level":"error","scope":"env","message":"Variável obrigatória ausente: SUPABASE_SERVICE_ROLE_KEY","at":"2024-01-15T10:30:00.000Z"}
```
Console adicional:
```
[ENV ERROR] Configure SUPABASE_SERVICE_ROLE_KEY no .env ou .env.local
[ENV ERROR] Encontre em: Supabase Dashboard → Settings → API → service_role key
```

## Uso no Código

```typescript
// agent/index.ts
import { loadAgentConfig } from './config';

const cfg = loadAgentConfig(); // Fail fast se env inválida

console.log('Agente iniciado com configuração válida');
console.log(`  Supabase: ${cfg.supabaseUrl.substring(0, 20)}...`);
console.log(`  SQLite: ${cfg.sqliteDbPath}`);
```

## Testes

```bash
# Testar validações
npx vitest run agent/config/env.test.ts

# Testar com env válida
npm run clock-sync-agent

# Simular env inválida (deve falhar imediatamente)
SUPABASE_URL= npm run clock-sync-agent
# → process.exit(1)
```

## Checklist de Deploy

- [ ] `SUPABASE_URL` definida (ou `VITE_SUPABASE_URL` como fallback)
- [ ] `SUPABASE_SERVICE_ROLE_KEY` definida
- [ ] URL começa com `https://`
- [ ] URL contém `.supabase.co`
- [ ] Service role key tem formato JWT (contém `.`)
- [ ] `.env.local` não commitado (está no `.gitignore`)

## Segurança

⚠️ **NUNCA**
- Commitar `.env.local` com service_role_key
- Expor service_role_key no frontend
- Logar service_role_key (mesmo parcial)

✅ **SEMPRE**
- Validar env no startup (fail fast)
- Usar service_role apenas no backend/agente
- Usar anon_key no frontend com RLS
