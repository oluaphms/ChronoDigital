# Deploy na Vercel – checklist e erros comuns

## Se o deploy falhar (Build failed)

1. **Veja o log exato**  
   No dashboard da Vercel: **Deployments** → clique no deploy que falhou → **Building** (ou **Logs**). O erro exato aparece aí.

2. **Módulo REP: nome da pasta**  
   O código importa **`modules/rep-integration`** (com hífen). Na Vercel o ambiente é Linux, onde pastas diferenciam maiúsculas/minúsculas.

   - Se no repositório existir só **`modules/repIntegration`** (camelCase), o build quebra com algo como:  
     `Cannot find module '.../rep-integration/repSyncJob'` ou similar.
   - **Solução:** manter a pasta **`modules/rep-integration`** (com hífen) no repositório, com os arquivos usados pela API e pelo front (ex.: `repSyncJob.ts`, `repService.ts`, `repParser.ts`).

3. **Build local**  
   Antes de dar push, rode no projeto:
   ```bash
   npm install
   npm run build
   ```
   Se falhar aí, corrija antes de tentar o deploy de novo.

4. **Variáveis de ambiente**  
   Na Vercel: **Settings** → **Environment Variables**. Para o app e para as **API Routes** (ex.: `/api/rep/sync`) configure pelo menos:
   - `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (front)
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (API/serverless)
   - `API_KEY` ou `CRON_SECRET` se usar o cron do REP.

## Configuração atual (vercel.json)

- **Framework:** Vite  
- **Build:** `npm run build`  
- **Saída:** pasta `dist`  
- **Rewrites:** SPA (tudo que não for `/api/*` vai para `index.html`)  
- **Cron:** `/api/rep/sync` a cada 5 minutos (se configurado)

Se o erro no log for outro (por exemplo `vite` não encontrado, ou falha em `api/rep/...`), use a mensagem exata do log para procurar na [documentação da Vercel](https://vercel.com/docs/deployments/troubleshoot-a-build).
