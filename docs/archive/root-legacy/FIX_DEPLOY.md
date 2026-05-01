# Correções para Problemas de Deploy

## Problema: Erro MIME Type - "Expected a JavaScript module script"

### Causa
O Vercel estava redirecionando TODAS as requisições (incluindo arquivos JS/CSS) para `/index.html`, causando erro de MIME type quando o navegador tentava carregar arquivos JavaScript.

### Solução Implementada

1. **vercel.json atualizado**:
   - Rewrite pattern corrigido para NÃO redirecionar arquivos estáticos
   - Exclui: `.js`, `.css`, `.json`, `.ico`, `.svg`, `.png`, etc.
   - Exclui: pasta `assets/`, `sw.js`, `manifest.json`, `favicon.*`

2. **vite.config.ts otimizado**:
   - Configuração de build melhorada
   - Arquivos organizados em pasta `assets/`
   - Nomes de arquivos com hash para cache busting

### Arquivos Modificados
- `vercel.json` - Rewrites corrigidos
- `vite.config.ts` - Build config otimizado

## Como Testar

1. Faça o build localmente:
   ```bash
   npm run build
   ```

2. Verifique se os arquivos JS estão na pasta `dist/assets/`:
   ```bash
   ls dist/assets/
   ```

3. Verifique se o `dist/index.html` tem referências corretas aos arquivos JS:
   ```bash
   cat dist/index.html | grep "assets/"
   ```

4. Faça deploy e teste:
   - Limpe o cache do navegador
   - Teste em modo anônimo
   - Verifique o console do navegador

## Se o Problema Persistir

1. Verifique o build na Vercel:
   - Vá em Deployments → Último deploy → Build Logs
   - Verifique se há erros no build

2. Verifique os arquivos gerados:
   - No deploy, clique em "Browse" para ver os arquivos
   - Confirme que `assets/` existe e tem arquivos `.js`

3. Limpe cache:
   - Vercel: Settings → Clear Build Cache
   - Navegador: Ctrl+Shift+Delete → Limpar cache
