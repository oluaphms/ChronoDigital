# 🧪 TESTE DE PERFORMANCE - HOJE (30 min)

**Data**: 12 de Abril de 2026  
**Objetivo**: Validar que as otimizações implementadas estão funcionando

---

## 📋 CHECKLIST DE TESTES

### Teste 1: AdminView - Carregamento Paralelo ✅

**O que testar**: Verificar se as requisições de funcionários e empresa estão sendo feitas em paralelo

**Passos**:
1. Abrir DevTools (F12)
2. Ir para aba "Network"
3. Limpar histórico (Ctrl+Shift+Delete)
4. Navegar para AdminView
5. Observar as requisições

**Esperado**:
- ✅ Requisições de `getAllEmployees` e `getCompany` começam **ao mesmo tempo**
- ✅ Tempo total: ~1.5s (antes era ~3s)
- ✅ Ambas as requisições aparecem com timestamps próximos

**Como validar**:
```
Antes: 
  getAllEmployees: 0ms → 1500ms
  getCompany: 1500ms → 3000ms
  Total: 3000ms

Depois:
  getAllEmployees: 0ms → 1500ms
  getCompany: 0ms → 1500ms
  Total: 1500ms ✅
```

---

### Teste 2: useRecords - Tamanho de Resposta ✅

**O que testar**: Verificar se o tamanho da resposta diminuiu de 5-10MB para 50-100KB

**Passos**:
1. Abrir DevTools (F12)
2. Ir para aba "Network"
3. Filtrar por "time_records" ou "records"
4. Clicar na requisição
5. Ir para aba "Response"

**Esperado**:
- ✅ Tamanho de resposta: 50-100KB (antes era 5-10MB)
- ✅ Apenas colunas necessárias: `id, user_id, type, method, created_at, location, photo_url, fraud_flags, status, manual_reason`
- ✅ Máximo 50 registros por página

**Como validar**:
```
Antes:
  Size: 5-10MB
  Columns: id, user_id, type, method, created_at, location, photo_url, 
           fraud_flags, status, manual_reason, company_id, updated_at, 
           deleted_at, ... (muitas colunas desnecessárias)

Depois:
  Size: 50-100KB ✅
  Columns: id, user_id, type, method, created_at, location, photo_url, 
           fraud_flags, status, manual_reason (apenas necessárias)
```

---

### Teste 3: useNavigationBadges - Contagem Otimizada ✅

**O que testar**: Verificar se a contagem de requisições pendentes está usando count=exact

**Passos**:
1. Abrir DevTools (F12)
2. Ir para aba "Network"
3. Filtrar por "requests"
4. Clicar na requisição de contagem
5. Ir para aba "Response"

**Esperado**:
- ✅ Resposta é apenas um número (ex: `{"count": 5}`)
- ✅ Tamanho: < 1KB (antes era 1-2MB)
- ✅ Tempo de resposta: 100-200ms (antes era 500-800ms)

**Como validar**:
```
Antes:
  Size: 1-2MB
  Response: [
    { id: "...", user_id: "...", type: "...", status: "pending", created_at: "...", ... },
    { id: "...", user_id: "...", type: "...", status: "pending", created_at: "...", ... },
    ...
  ]

Depois:
  Size: < 1KB ✅
  Response: { count: 5 }
```

---

## 📊 MÉTRICAS A COLETAR

### Antes vs Depois

| Métrica | Antes | Depois | Esperado |
|---------|-------|--------|----------|
| Tempo AdminView | ___ s | ___ s | 50% redução |
| Tamanho useRecords | ___ MB | ___ KB | 99% redução |
| Tempo useRecords | ___ s | ___ s | 75% redução |
| Tamanho badges | ___ MB | ___ KB | 95% redução |
| Tempo badges | ___ s | ___ s | 80% redução |

---

## 🔍 COMO USAR DEVTOOLS NETWORK

### Passo 1: Abrir DevTools
```
Windows/Linux: F12 ou Ctrl+Shift+I
Mac: Cmd+Option+I
```

### Passo 2: Ir para Network
- Clique na aba "Network"

### Passo 3: Limpar Histórico
- Clique no ícone de lixeira ou Ctrl+Shift+Delete

### Passo 4: Recarregar Página
- Pressione F5 ou Ctrl+R

### Passo 5: Analisar Requisições
- Procure por requisições de API
- Clique em cada uma para ver detalhes
- Verifique:
  - **Size**: Tamanho da resposta
  - **Time**: Tempo de resposta
  - **Response**: Conteúdo da resposta

---

## 🎯 VALIDAÇÃO FINAL

### Checklist de Sucesso

- [ ] AdminView carrega em paralelo (tempo reduzido em 50%)
- [ ] useRecords retorna apenas colunas necessárias (tamanho reduzido em 99%)
- [ ] useRecords retorna máximo 50 registros (paginação funcionando)
- [ ] useNavigationBadges retorna apenas contagem (tamanho reduzido em 95%)
- [ ] Sem erros no console
- [ ] Sem erros de rede (status 200)
- [ ] Todas as funcionalidades continuam funcionando

### Se Algo Não Funcionar

1. **Verificar console** (F12 → Console)
   - Procure por erros vermelhos
   - Anote a mensagem de erro

2. **Verificar Network** (F12 → Network)
   - Procure por requisições com status 4xx ou 5xx
   - Clique na requisição para ver detalhes

3. **Verificar imports**
   - Certifique-se de que `queryOptimizations.ts` existe
   - Certifique-se de que os imports estão corretos

---

## 📝 NOTAS IMPORTANTES

1. **Primeira carga pode ser mais lenta**
   - Supabase pode precisar compilar as queries
   - Recarregue a página para ver a performance real

2. **Cache do navegador**
   - Limpe o cache se ver respostas em cache
   - Use Ctrl+Shift+Delete para limpar

3. **Modo offline**
   - Algumas requisições podem falhar se estiver offline
   - Verifique a conexão de internet

4. **Diferentes regiões**
   - Performance pode variar dependendo da localização
   - Teste de diferentes locais se possível

---

## 🚀 PRÓXIMOS PASSOS APÓS VALIDAÇÃO

Se tudo estiver funcionando:

1. ✅ Documentar resultados
2. ✅ Fazer commit das mudanças
3. ✅ Deploy em staging
4. ✅ Testar em staging
5. ✅ Deploy em produção
6. ✅ Monitorar performance em produção

Se algo não funcionar:

1. ❌ Verificar erros no console
2. ❌ Verificar Network tab
3. ❌ Reverter mudanças se necessário
4. ❌ Investigar causa do problema

---

**Tempo estimado**: 15-20 minutos

**Próximo passo**: Implementar React Query (esta semana)
