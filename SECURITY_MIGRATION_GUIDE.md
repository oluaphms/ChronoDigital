# Guia de Migração - Hardening de Segurança PontoWebDesk

**Data:** 27/04/2026  
**Versão:** 1.0.0  
**Prioridade:** CRÍTICO

---

## Resumo Executivo

Este guia documenta todas as correções de segurança implementadas para preparar o PontoWebDesk para produção segura em escala.

### Checklist de Ações Imediatas

- [ ] **1. ROTACIONAR CHAVES EXPOSTAS** (se aplicável)
- [ ] **2. CONFIGURAR VARIÁVEIS DE AMBIENTE**
- [ ] **3. APLICAR MIGRAÇÕES DO SUPABASE**
- [ ] **4. CONFIGURAR CORS EM PRODUÇÃO**
- [ ] **5. TESTAR FUNCIONAMENTO**

---

## ETAPA 1: Correções Críticas (Concluídas)

### 1.1 Chaves de Ambiente

**Arquivos modificados:**
- `.env.example`
- `.env.local.example`

**Alterações:**
- Removidas todas as chaves reais dos arquivos de exemplo
- Adicionados placeholders seguros
- Documentação de segurança adicionada

**Ação necessária:**
```bash
# Copie o template e configure suas chaves REAIS
# NUNCA commite o arquivo .env.local

cp .env.local.example .env.local

# Edite .env.local com suas chaves
# Gere chaves seguras com:
openssl rand -hex 32
```

### 1.2 Timestamp Signer

**Arquivo:** `services/timestampSigner.js`

**Alterações:**
- Removido fallback `pontowebdesk-default-key-change-in-prod`
- Adicionada validação obrigatória de `TIMESTAMP_SECRET_KEY`
- Lança erro se chave não configurada

**Configuração necessária:**
```bash
# Adicione ao .env.local
TIMESTAMP_SECRET_KEY=sua_chave_segura_aqui_min_32_chars
```

### 1.3 CORS Seguro

**Arquivos:**
- `api/_shared/security.ts` (novo)
- `api/timesheet.ts`
- `api/employees.ts`
- `api/health.ts`
- `api/employee-invite.ts`
- `modules/rep-integration/repVercelAuth.ts`

**Alterações:**
- Criado módulo centralizado de segurança
- Implementado CORS com whitelist
- Rate limiting por IP
- Headers de segurança (X-Content-Type-Options, X-Frame-Options)

**Configuração de produção:**
```bash
# No .env.local ou Vercel
CORS_ALLOWED_ORIGINS=https://app.seudominio.com,https://admin.seudominio.com
```

---

## ETAPA 2: Rate Limiting (Concluída)

**Implementado em:** `api/_shared/security.ts`

**Limites padrão:**
- Geral: 100 req/min por IP
- Login: 5 req/min por IP
- APIs: 60 req/min por IP
- Batidas: 10 req/min por IP

---

## ETAPA 3: Proteção de Senhas (Concluída)

**Implementado em:** `src/services/passwordPolicy.ts`

**Política:**
- Mínimo 8 caracteres
- 1 maiúscula
- 1 minúscula
- 1 número
- 1 símbolo
- Bloqueio após 5 tentativas
- Cooldown de 5 minutos

---

## ETAPA 4: Criptografia Biométrica (Concluída)

**Implementado em:** `services/biometricEncryption.ts`

**Algoritmo:** AES-256-GCM

**Configuração:**
```bash
# Adicione ao .env.local
BIOMETRIC_ENCRYPTION_KEY=sua_chave_256_bits_aqui
```

---

## ETAPA 5-7: Migrações Supabase (Concluídas)

**Arquivo:** `supabase/migrations/20260427000000_security_hardening_audit_lgpd.sql`

### Tabelas Criadas

| Tabela | Propósito |
|--------|-----------|
| `audit_log` | Registro imutável de ações |
| `user_consents` | Consentimentos LGPD |
| `dpo_info` | Informações do DPO |
| `data_portability_requests` | Exportação de dados (LGPD) |
| `data_deletion_requests` | Exclusão/anonimização (LGPD) |
| `device_keys` | Chaves por dispositivo REP |
| `login_attempts` | Proteção brute force |

### Aplicação das Migrações

```bash
# Via Supabase CLI
supabase db push

# Ou via Dashboard SQL Editor
# Copie o conteúdo de 20260427000000_security_hardening_audit_lgpd.sql
```

---

## Configuração de Produção

### Variáveis de Ambiente Obrigatórias

```bash
# Supabase
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua_anon_key
SUPABASE_SERVICE_ROLE_KEY=sua_service_role_key
SUPABASE_URL=https://seu-projeto.supabase.co

# Segurança
API_KEY=chave_segura_api_gerada_openssl
CRON_SECRET=chave_segura_cron_gerada_openssl
TIMESTAMP_SECRET_KEY=chave_segura_timestamp
BIOMETRIC_ENCRYPTION_KEY=chave_segura_biometria

# CORS (produção)
CORS_ALLOWED_ORIGINS=https://app.seudominio.com

# Opcional: Chaves específicas por serviço
REP_API_KEY=chave_especifica_rep
```

### Geração de Chaves

```bash
# Gere todas as chaves necessárias
openssl rand -hex 32  # Para API_KEY
openssl rand -hex 32  # Para CRON_SECRET
openssl rand -hex 32  # Para TIMESTAMP_SECRET_KEY
openssl rand -hex 32  # Para BIOMETRIC_ENCRYPTION_KEY
```

---

## Checklist Pré-Deploy

### Segurança Básica
- [ ] `.env.local` configurado e NÃO commitado
- [ ] `.env.example` sem valores reais
- [ ] `API_KEY` gerada e configurada
- [ ] `TIMESTAMP_SECRET_KEY` gerada e configurada
- [ ] `BIOMETRIC_ENCRYPTION_KEY` gerada (se usar biometria)
- [ ] `CORS_ALLOWED_ORIGINS` configurado para produção

### Supabase
- [ ] Migrações aplicadas
- [ ] RLS ativado em todas as tabelas
- [ ] Políticas revisadas
- [ ] Service Role Key nunca exposta no frontend

### Testes
- [ ] Login funciona
- [ ] Registro de ponto funciona
- [ ] APIs respondem corretamente
- [ ] Rate limiting funciona (teste excesso de requisições)
- [ ] CORS bloqueia origens não permitidas

---

## Monitoramento Pós-Deploy

### Logs de Segurança

```sql
-- Verificar tentativas de login suspeitas
SELECT * FROM public.suspicious_login_attempts;

-- Resumo de auditoria por empresa
SELECT * FROM public.company_audit_summary;

-- Verificar eventos críticos
SELECT * FROM public.audit_log
WHERE severity = 'critical'
AND timestamp > NOW() - INTERVAL '24 hours';
```

### Alertas Recomendados

Configure alertas para:
- Mais de 10 tentativas de login falhas/minuto
- Requisições de IPs não listados no CORS
- Erros de validação de API_KEY
- Eventos de auditoria com severity = 'critical'

---

## Conformidade

### LGPD
- [ ] DPO registrado (`dpo_info`)
- [ ] Consentimento dos usuários coletado (`user_consents`)
- [ ] Processo de exportação de dados implementado
- [ ] Processo de exclusão/anonimização implementado
- [ ] Retenção de dados configurada (5 anos)

### Portaria 671
- [ ] Assinatura digital de registros implementada
- [ ] Auditoria de alterações funcionando
- [ ] Backup automático configurado

---

## Contato e Suporte

Em caso de dúvidas sobre segurança:
1. Revise este guia
2. Consulte a documentação do Supabase sobre RLS
3. Verifique logs de auditoria

---

## Histórico de Alterações

| Data | Versão | Descrição |
|------|--------|-----------|
| 2026-04-27 | 1.0.0 | Implementação inicial do hardening de segurança |

---

**IMPORTANTE:** Este guia deve ser revisado a cada deploy em produção.
