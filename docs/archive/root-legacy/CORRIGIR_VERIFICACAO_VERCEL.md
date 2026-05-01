# Corrigir Falha de Verificação no Vercel

## Problema
"Todas as verificações falharam" ou "1 verificação falha" no deploy do Vercel.

## Configuração Atual Simplificada

O `vercel.json` foi simplificado para a configuração mínima:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite",
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

## Possíveis Causas e Soluções

### 1. Diretório de Saída Ausente ou Vazio

**Erro:** "diretório público ausente"

**Solução:**
1. Execute o build localmente:
   ```bash
   npm run build
   ```

2. Verifique se a pasta `dist` foi criada:
   ```bash
   ls dist
   # ou no Windows PowerShell:
   Get-ChildItem dist
   ```

3. Verifique se há arquivos em `dist`:
   ```bash
   ls dist/assets
   ```

4. Se `dist` estiver vazio ou não existir:
   - Verifique se há erros no build
   - Verifique se `vite.config.ts` está correto
   - Verifique se `package.json` tem o script `build` correto

### 2. Script de Build Ausente

**Erro:** "Script de compilação ausente"

**Solução:**
Verifique se `package.json` tem:
```json
{
  "scripts": {
    "build": "vite build"
  }
}
```

### 3. Configuração do Projeto no Vercel

**Verificar no Vercel Dashboard:**

1. Vá para: **Settings > General > Build & Development Settings**

2. Verifique:
   - **Framework Preset:** `Vite` ou `Other`
   - **Build Command:** `npm run build` (ou deixe vazio para usar do vercel.json)
   - **Output Directory:** `dist` (ou deixe vazio para usar do vercel.json)
   - **Install Command:** `npm install` (padrão)

3. **IMPORTANTE:** Se você definir `buildCommand` ou `outputDirectory` no Dashboard, eles **sobrescrevem** o `vercel.json`. Nesse caso:
   - Remova essas configurações do Dashboard, OU
   - Remova do `vercel.json` e configure apenas no Dashboard

### 4. Problema com Rewrite

**Se o erro for sobre rewrite inválido:**

O rewrite atual é simples e deve funcionar:
```json
"rewrites": [
  {
    "source": "/(.*)",
    "destination": "/index.html"
  }
]
```

Se ainda houver erro, tente remover completamente:
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite"
}
```

O Vercel detecta automaticamente projetos Vite e configura rewrites.

## Passos para Resolver

### Passo 1: Verificar Build Local
```bash
npm run build
```

**Deve criar:**
- `dist/index.html`
- `dist/assets/index-[hash].js`
- `dist/assets/index-[hash].css`
- Outros arquivos estáticos

### Passo 2: Verificar vercel.json
```bash
# Verificar sintaxe JSON
cat vercel.json | python -m json.tool
# ou use um validador JSON online
```

### Passo 3: Limpar Configurações do Dashboard

No Vercel Dashboard:
1. Settings > General > Build & Development Settings
2. **Remova** Build Command e Output Directory (deixe vazios)
3. Deixe o Vercel usar o `vercel.json`

### Passo 4: Fazer Deploy

```bash
git add vercel.json
git commit -m "fix: simplificar vercel.json para configuração mínima"
git push
```

### Passo 5: Verificar Logs do Deploy

No Vercel Dashboard:
1. Vá para a aba "Deployments"
2. Clique no deploy mais recente
3. Veja os logs de build
4. Procure por erros específicos

## Se o Problema Persistir

### Opção 1: Remover vercel.json Completamente

O Vercel pode detectar projetos Vite automaticamente. Tente:

1. Renomear `vercel.json` para `vercel.json.backup`
2. Fazer commit e push
3. Ver se o deploy funciona

Se funcionar, o problema estava no `vercel.json`.

### Opção 2: Usar Configuração no Dashboard Apenas

1. Remova `buildCommand` e `outputDirectory` do `vercel.json`
2. Configure apenas no Dashboard do Vercel
3. Deixe apenas o rewrite no `vercel.json`:

```json
{
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

### Opção 3: Verificar Erro Específico

Se você puder ver o erro específico nos logs do Vercel, compartilhe para uma solução mais direcionada.

## Checklist de Verificação

- [ ] Build local funciona (`npm run build`)
- [ ] Pasta `dist` é criada com arquivos
- [ ] `vercel.json` tem sintaxe JSON válida
- [ ] Configurações do Dashboard não conflitam
- [ ] Framework está definido como "Vite" ou "Other"
- [ ] Build Command está correto ou vazio
- [ ] Output Directory está correto ou vazio
- [ ] Deploy foi feito após as correções

## Configuração Recomendada Final

Para projetos Vite no Vercel, a configuração mais simples e confiável é:

**vercel.json:**
```json
{
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

**Dashboard do Vercel:**
- Framework Preset: `Vite`
- Build Command: (vazio - usa padrão do Vite)
- Output Directory: (vazio - usa padrão `dist`)
- Install Command: `npm install` (padrão)

O Vercel detecta automaticamente projetos Vite e configura tudo corretamente.
