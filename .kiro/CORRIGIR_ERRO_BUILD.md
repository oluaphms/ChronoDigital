# Corrigir Erro de Build

## Problema
Erro ao carregar módulo Requests:
```
Failed to load module script: Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "text/html"
```

## Causa
O build anterior falhou ou o cache está corrompido. O arquivo não foi compilado corretamente.

## Solução

### Opção 1: Limpar Cache e Fazer Rebuild (Recomendado)

1. **Limpar cache local:**
   ```bash
   rm -rf node_modules/.vite
   rm -rf dist
   ```

2. **Reinstalar dependências:**
   ```bash
   npm install
   ```

3. **Fazer rebuild:**
   ```bash
   npm run build
   ```

4. **Fazer deploy:**
   - Commit e push das mudanças
   - Deploy no Vercel (ou seu servidor)

### Opção 2: Limpar Cache no Vercel

1. **Ir para Vercel Dashboard**
2. **Selecionar o projeto**
3. **Ir para Settings → Deployments**
4. **Clicar em "Clear Cache"**
5. **Fazer novo deploy:**
   - Ir para Deployments
   - Clicar em "Redeploy" no último deploy

### Opção 3: Forçar Novo Deploy

1. **Fazer um commit vazio:**
   ```bash
   git commit --allow-empty -m "Rebuild"
   git push
   ```

2. **Vercel detectará a mudança e fará novo build**

## Verificação

Após o deploy, verificar:

1. **Abrir DevTools (F12)**
2. **Ir para Console**
3. **Verificar se há erros de módulo**
4. **Recarregar a página (Ctrl+F5)**
5. **Verificar se a página de Solicitações carrega**

## Se o Erro Persistir

### Verificar Sintaxe

```bash
npm run lint
```

### Verificar Build Local

```bash
npm run build
```

Se houver erro, verificar a mensagem de erro e corrigir.

### Verificar Imports

Verificar se todos os imports em `src/pages/Requests.tsx` estão corretos:
- `../hooks/useCurrentUser` ✓
- `../components/PageHeader` ✓
- `../components/DataTable` ✓
- `../components/ModalForm` ✓
- `../../components/UI` ✓
- `../../lib/i18n` ✓
- `../contexts/LanguageContext` ✓
- `../services/supabaseClient` ✓
- `../../services/notificationService` ✓
- `../../services/loggingService` ✓
- `../../types` ✓
- `../components/ToastProvider` ✓
- `../components/ClickableFullContent` ✓

## Próximos Passos

1. **Escolher uma opção acima**
2. **Executar os passos**
3. **Aguardar o deploy completar**
4. **Recarregar a página**
5. **Verificar se funciona**

## Resumo

O erro é de build, não de código. As soluções acima devem resolver o problema limpando o cache e fazendo rebuild.
