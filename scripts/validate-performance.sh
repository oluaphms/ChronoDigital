#!/bin/bash

# Script de Validação de Performance
# Verifica se todas as otimizações foram implementadas corretamente

echo "🚀 Iniciando validação de performance..."
echo ""

# Cores
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Contadores
PASSED=0
FAILED=0

# Função para verificar
check() {
  local name=$1
  local command=$2
  
  if eval "$command" > /dev/null 2>&1; then
    echo -e "${GREEN}✅${NC} $name"
    ((PASSED++))
  else
    echo -e "${RED}❌${NC} $name"
    ((FAILED++))
  fi
}

# Função para avisar
warn() {
  local name=$1
  echo -e "${YELLOW}⚠️${NC} $name"
}

echo "📦 Verificando dependências..."
check "React Query instalado" "npm list @tanstack/react-query"
check "Vite instalado" "npm list vite"
check "React instalado" "npm list react"
echo ""

echo "📁 Verificando arquivos..."
check "vercel.json existe" "test -f vercel.json"
check "vite.config.ts existe" "test -f vite.config.ts"
check "src/lib/queryClient.ts existe" "test -f src/lib/queryClient.ts"
check "App.tsx existe" "test -f App.tsx"
echo ""

echo "🔍 Verificando código..."
check "Sem SELECT * em queries" "! grep -r 'SELECT \*' src/ services/ 2>/dev/null | grep -v 'comentário' | grep -v '.md'"
check "QueryClientProvider em App.tsx" "grep -q 'QueryClientProvider' App.tsx"
check "useQuery em AdminView.tsx" "grep -q 'useQuery' components/AdminView.tsx"
check "useMutation em AdminView.tsx" "grep -q 'useMutation' components/AdminView.tsx"
check "useQuery em useRecords.ts" "grep -q 'useQuery' src/hooks/useRecords.ts"
check "useQuery em useNavigationBadges.ts" "grep -q 'useQuery' src/hooks/useNavigationBadges.ts"
echo ""

echo "⚙️ Verificando configurações..."
check "Cache headers em vercel.json" "grep -q 'Cache-Control' vercel.json"
check "Gzip compression em vercel.json" "grep -q 'COMPRESS' vercel.json"
check "Code splitting em vite.config.ts" "grep -q 'manualChunks' vite.config.ts"
check "CSS minify em vite.config.ts" "grep -q 'cssMinify' vite.config.ts"
echo ""

echo "📊 Verificando documentação..."
check "DIAGNOSTICO_PERFORMANCE.md existe" "test -f DIAGNOSTICO_PERFORMANCE.md"
check "IMPLEMENTACAO_REACT_QUERY.md existe" "test -f IMPLEMENTACAO_REACT_QUERY.md"
check "FASE_3_OTIMIZACOES_FINAIS.md existe" "test -f FASE_3_OTIMIZACOES_FINAIS.md"
check "TESTE_PERFORMANCE_HOJE.md existe" "test -f TESTE_PERFORMANCE_HOJE.md"
echo ""

# Resumo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo -e "Resultado: ${GREEN}✅ $PASSED passou${NC} | ${RED}❌ $FAILED falhou${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}🎉 Todas as validações passaram!${NC}"
  echo ""
  echo "Próximos passos:"
  echo "1. Testar com DevTools Network tab"
  echo "2. Executar: npm run build"
  echo "3. Verificar tamanho do bundle"
  echo "4. Deploy em staging"
  echo "5. Deploy em produção"
  exit 0
else
  echo -e "${RED}⚠️ Algumas validações falharam!${NC}"
  echo ""
  echo "Verifique os erros acima e corrija antes de fazer deploy."
  exit 1
fi
