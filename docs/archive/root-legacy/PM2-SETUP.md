# Configuração PM2 - Agente Automático

## Status Atual
✅ PM2 instalado
✅ Agente configurado e rodando
⏳ Startup automático pendente (requer admin)

## O que foi feito
1. PM2 instalado globalmente
2. Arquivo `ecosystem.config.cjs` criado
3. Agente `clock-agent` iniciado e rodando em background

## Verificar status atual
```bash
pm2 status
```

## Comandos úteis do PM2

```bash
# Ver status
pm2 status

# Ver logs em tempo real
pm2 logs clock-agent

# Parar o agente
pm2 stop clock-agent

# Reiniciar o agente
pm2 restart clock-agent

# Recarregar após alterações
pm2 reload clock-agent

# Monitorar recursos
pm2 monit
```

## Configurar Startup Automático (Requer Administrador)

### Opção 1: Usando Agendador de Tarefas (Recomendado)

1. Abra o PowerShell **como Administrador**
2. Execute:
```powershell
schtasks /create /tn "ClockAgent-PM2" /tr "cmd /c cd /d D:\PontoWebDesk && pm2 resurrect" /sc onlogon /rl highest /f
```

### Opção 2: Usando Script de Startup

1. Crie um arquivo `start-pm2.bat`:
```batch
@echo off
cd /d D:\PontoWebDesk
pm2 resurrect
```

2. Pressione `Win + R`, digite `shell:startup` e pressione Enter
3. Copie um atalho do `start-pm2.bat` para essa pasta

### Opção 3: Serviço Windows (mais robusto)

Instale o `pm2-windows-service`:
```bash
npm install -g pm2-windows-service
pm2-service-install -n ClockAgent
```

## Responder à pergunta sobre o cliente

**Sim, o mesmo deve ser feito no computador do cliente.**

Para cada computador que vai rodar o agente local (conectado ao relógio REP), você precisa:

1. Instalar o Node.js (>= 20)
2. Instalar as dependências do projeto: `npm install`
3. Configurar variáveis de ambiente no arquivo `.env`:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `CLOCK_SYNC_COMPANY_ID`
4. Instalar PM2: `npm install -g pm2 tsx`
5. Copiar o arquivo `ecosystem.config.cjs`
6. Iniciar o agente: `pm2 start ecosystem.config.cjs`
7. Configurar startup automático

## Arquivo ecosystem.config.cjs

O arquivo já está pronto na raiz do projeto. Contém:
- Nome do processo: `clock-agent`
- Script: `agent/index.ts`
- Interpretador: `tsx`
- Auto-restart: habilitado
- Logs em: `D:\PontoWebDesk\agent\logs\`
