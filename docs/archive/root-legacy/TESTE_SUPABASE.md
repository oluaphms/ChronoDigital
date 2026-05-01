# 🧪 TESTE DE VERIFICAÇÃO - Supabase Configuration

## ✅ CHECKLIST DE VERIFICAÇÃO

### 1️⃣ Verificar Variáveis no Console

Abra o navegador em https://chrono-digital.vercel.app/ e execute no console (F12):

```javascript
// Verificar se as variáveis foram injetadas
console.log('SUPABASE_URL:', window.__VITE_SUPABASE_URL);
console.log('SUPABASE_ANON_KEY:', window.__VITE_SUPABASE_ANON_KEY);

// Resultado esperado:
// SUPABASE_URL: https://aigegesxwrmgktmkbers.supabase.co
// SUPABASE_ANON_KEY: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**✅ PASSOU:** Ambas as variáveis aparecem com valores
**❌ FALHOU:** Uma ou ambas aparecem como `undefined`

---

### 2️⃣ Verificar Logs de Inicialização

No console, procure por:

```
✅ [Supabase] Configuração validada com sucesso
   URL: https://aigegesxwrmgktmkbers.supabase.co...
   Key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**✅ PASSOU:** Mensagem aparece
**❌ FALHOU:** Mensagem não aparece ou há erro

---

### 3️⃣ Verificar se o App Abre

- **✅ PASSOU:** Página carrega sem erro `supabaseUrl is required`
- **❌ FALHOU:** Erro aparece no console

---

### 4️⃣ Testar Login

1. Vá para a página de login
2. Tente fazer login com credenciais válidas
3. Verifique se o Supabase está respondendo

**✅ PASSOU:** Login funciona ou mostra erro de credenciais (não de Supabase)
**❌ FALHOU:** Erro de conexão com Supabase

---

### 5️⃣ Testar Carregamento de Dados

Se conseguiu fazer login:

1. Vá para a página de funcionários
2. Verifique se os dados carregam

**✅ PASSOU:** Dados aparecem
**❌ FALHOU:** Erro ao carregar dados

---

## 🔍 DIAGNÓSTICO DE PROBLEMAS

### Problema: `supabaseUrl is required`

**Causa:** Variáveis não foram injetadas

**Solução:**
1. Limpar cache: `Ctrl+Shift+Delete`
2. Hard refresh: `Ctrl+Shift+R`
3. Verificar se `public/env-config.js` existe

---

### Problema: Variáveis aparecem como `undefined`

**Causa:** `env-config.js` não foi carregado

**Solução:**
1. Verificar se o script está no `index.html`
2. Verificar se `public/env-config.js` existe
3. Fazer hard refresh

---

### Problema: Erro de conexão com Supabase

**Causa:** URL ou chave inválida

**Solução:**
1. Verificar se `VITE_SUPABASE_URL` está correto na Vercel
2. Verificar se `VITE_SUPABASE_ANON_KEY` está correto na Vercel
3. Fazer redeploy

---

## 📊 RESULTADO ESPERADO

```
✅ Variáveis injetadas corretamente
✅ Logs de inicialização aparecem
✅ App abre sem erro
✅ Login funciona
✅ Dados carregam
```

---

## 🚀 PRÓXIMAS AÇÕES

Se tudo passou:
- ✅ Problema resolvido!
- ✅ App está pronto para uso

Se algo falhou:
- 🔧 Verificar logs no console
- 🔧 Fazer hard refresh
- 🔧 Verificar variáveis na Vercel
- 🔧 Fazer redeploy

---

**Data do Teste:** 12 de Abril de 2026
**Versão:** 1.0.0
