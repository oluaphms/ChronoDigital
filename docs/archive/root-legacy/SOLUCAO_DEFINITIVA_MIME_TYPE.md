# Solução Definitiva - Erro de MIME Type

## Problema
Arquivos JS estão sendo servidos como HTML, causando erro:
```
Failed to load module script: Expected a JavaScript-or-Wasm module script 
but the server responded with a MIME type of "text/html"
```

## Causa Raiz

O problema pode ter duas causas principais:

1. **Service Worker antigo** interceptando requisições e servindo HTML em cache
2. **Rewrite do Vercel** capturando arquivos estáticos (menos provável, mas possível)

## Soluções Aplicadas

### ✅ 1. Rewrites Explícitos no vercel.json

Agora os rewrites são explícitos e em ordem de prioridade:

```json
{
  "rewrites": [
    {
      "source": "/assets/:path*",
      "destination": "/assets/:path*"
    },
    {
      "source": "/(.*\\.(js|css|json|ico|svg|png|jpg|jpeg|gif|webp|woff|woff2|ttf|eot))",
      "destination": "/$1"
    },
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

**Ordem de processamento:**
1. Primeiro: Serve `/assets/*` diretamente
2. Segundo: Serve arquivos com extensões estáticas diretamente
3. Por último: Redireciona tudo mais para `index.html`

### ✅ 2. Limpeza de Service Worker ANTES do JavaScript

O script de limpeza agora executa **ANTES** do script `type="module"`:

```html
<script>
  // Limpar Service Workers ANTES de qualquer requisição
  navigator.serviceWorker.getRegistrations().then(...)
</script>
<script type="module" src="/index.tsx"></script>
```

Isso garante que o Service Worker seja desregistrado antes de qualquer requisição de módulo ser feita.

## Ações Necessárias

### 1. Fazer Commit e Push
```bash
git add vercel.json index.html
git commit -m "fix: corrigir erro MIME type - rewrites explícitos e limpeza de SW"
git push
```

### 2. Limpar Cache do Vercel
**CRÍTICO:** Limpe o cache do build:

1. Vercel Dashboard > Seu Projeto > Settings > General
2. Role até "Build & Development Settings"
3. Clique em **"Clear Build Cache"**
4. Aguarde o deploy automático ou faça deploy manual

### 3. Limpar Service Worker Manualmente (Primeira Vez)

**IMPORTANTE:** Se o Service Worker ainda estiver ativo, você precisa limpar manualmente na primeira vez:

#### Chrome/Edge:
1. F12 (DevTools)
2. Application > Service Workers
3. Clique em "Unregister" em todos os SWs
4. Application > Storage > Clear site data
5. Ctrl+Shift+R (hard reload)

#### Firefox:
1. F12 (DevTools)
2. Application > Service Workers
3. Clique em "Unregister" em todos os SWs
4. Application > Storage > Clear All
5. Ctrl+Shift+R (hard reload)

#### Safari:
1. Desenvolvedor > Service Workers > Unregister All
2. Limpar cache do site
3. Recarregar página

## Verificação

### 1. Verificar Arquivo JS Diretamente
Abra no navegador:
```
https://app-smartponto.vercel.app/assets/index-[hash].js
```

**Resultados esperados:**
- ✅ Deve retornar JavaScript (código JS, não HTML)
- ✅ Content-Type deve ser `application/javascript`
- ✅ Status deve ser 200

**Se retornar HTML:**
- Problema no Vercel (cache ou configuração)
- Limpar cache do Vercel novamente
- Verificar se o arquivo existe em `dist/assets/`

**Se retornar 404:**
- Arquivo não foi gerado no build
- Verificar `npm run build` localmente
- Verificar se `dist/assets/` contém arquivos JS

### 2. Verificar no Console
Abra DevTools > Console:
- ✅ Não deve aparecer erro de MIME type
- ✅ Arquivos JS devem carregar corretamente
- ✅ Não deve aparecer "[CLEANUP] Reloading page..." (ou apenas uma vez)

### 3. Verificar Service Workers
DevTools > Application > Service Workers:
- ✅ Não deve haver nenhum SW registrado
- ✅ Se houver, desregistrar manualmente

## Se o Problema Persistir

### Opção 1: Verificar Build Local
```bash
npm run build
ls dist/assets/
```

Deve haver arquivos `.js` e `.css` com hash.

### Opção 2: Verificar Configuração do Vercel
No Vercel Dashboard:
- Settings > General > Build & Development Settings
- **Framework Preset:** Vite (ou Other)
- **Build Command:** `npm run build`
- **Output Directory:** `dist`
- **Install Command:** `npm install` (padrão)

### Opção 3: Desabilitar Service Worker Completamente
Se o problema persistir, podemos remover completamente o Service Worker:

1. Remover `public/sw.js`
2. Remover qualquer código que registre SW
3. Fazer novo deploy

## Por que isso funciona?

### Rewrites em Ordem
O Vercel processa rewrites em ordem. Ao colocar arquivos estáticos primeiro, garantimos que eles sejam servidos antes do rewrite genérico.

### Limpeza Antecipada
Ao executar a limpeza do Service Worker antes do JavaScript carregar, evitamos que ele intercepte requisições de módulos.

### Headers Explícitos
Os headers garantem Content-Type correto mesmo se houver algum problema no rewrite.

## Checklist Final

- [x] `vercel.json` com rewrites explícitos em ordem
- [x] Script de limpeza antes do JavaScript
- [ ] Commit e push feito
- [ ] Cache do Vercel limpo
- [ ] Service Worker limpo manualmente (primeira vez)
- [ ] Novo deploy realizado
- [ ] Arquivo JS acessível diretamente
- [ ] Sem erro de MIME type no console
- [ ] App funcionando corretamente

## Resultado Esperado

Após essas correções:
- ✅ Arquivos JS servidos com `Content-Type: application/javascript`
- ✅ Arquivos CSS servidos com `Content-Type: text/css`
- ✅ Rotas SPA redirecionadas para `index.html`
- ✅ Service Worker desabilitado (não interfere)
- ✅ Sem erro de MIME type
- ✅ App funcionando corretamente
