# 🚀 GUIA DE IMPLEMENTAÇÃO - REACT QUERY

**Objetivo**: Implementar cache global com React Query para eliminar requisições duplicadas e melhorar performance

**Tempo Estimado**: 2-3 horas  
**Impacto**: 50-70% redução em requisições

---

## 📦 INSTALAÇÃO

```bash
npm install @tanstack/react-query
# ou
yarn add @tanstack/react-query
```

---

## 🔧 CONFIGURAÇÃO INICIAL

### 1. Criar QueryClient (novo arquivo)

**Arquivo**: `src/lib/queryClient.ts`

```typescript
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutos
      gcTime: 10 * 60 * 1000, // 10 minutos (antes: cacheTime)
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 1,
    },
  },
});
```

### 2. Envolver App com QueryClientProvider

**Arquivo**: `App.tsx` (modificar)

```typescript
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {/* Seu app aqui */}
    </QueryClientProvider>
  );
}
```

---

## 🎯 PADRÕES DE USO

### Padrão 1: useQuery (Leitura de Dados)

**Antes** (sem cache):
```typescript
const [employees, setEmployees] = useState<EmployeeSummary[]>([]);
const [isLoading, setIsLoading] = useState(false);

useEffect(() => {
  setIsLoading(true);
  PontoService.getAllEmployees(companyId)
    .then(setEmployees)
    .finally(() => setIsLoading(false));
}, [companyId]);
```

**Depois** (com React Query):
```typescript
import { useQuery } from '@tanstack/react-query';

const { data: employees = [], isLoading } = useQuery({
  queryKey: ['employees', companyId],
  queryFn: () => PontoService.getAllEmployees(companyId),
  staleTime: 5 * 60 * 1000, // 5 minutos
});
```

**Benefícios**:
- ✅ Automático: cache, retry, refetch
- ✅ Deduplicação: mesma query = 1 requisição
- ✅ Menos código: sem useState, useEffect

---

### Padrão 2: useMutation (Escrita de Dados)

**Antes** (sem cache):
```typescript
const [isCreating, setIsCreating] = useState(false);
const [error, setError] = useState<string | null>(null);

const handleCreate = async (data: CreateEmployeeData) => {
  setIsCreating(true);
  setError(null);
  try {
    await PontoService.createEmployee(data);
    // Recarregar lista manualmente
    const updated = await PontoService.getAllEmployees(companyId);
    setEmployees(updated);
  } catch (err) {
    setError(err.message);
  } finally {
    setIsCreating(false);
  }
};
```

**Depois** (com React Query):
```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';

const queryClient = useQueryClient();

const { mutate: createEmployee, isPending, error } = useMutation({
  mutationFn: (data: CreateEmployeeData) => PontoService.createEmployee(data),
  onSuccess: () => {
    // Invalidar cache automaticamente
    queryClient.invalidateQueries({ queryKey: ['employees', companyId] });
  },
});

const handleCreate = (data: CreateEmployeeData) => {
  createEmployee(data);
};
```

**Benefícios**:
- ✅ Invalidação automática de cache
- ✅ Menos código: sem try/catch manual
- ✅ Estados gerenciados automaticamente

---

### Padrão 3: Queries Paralelas

**Antes** (sequencial = lento):
```typescript
useEffect(() => {
  const load = async () => {
    const employees = await PontoService.getAllEmployees(companyId);
    const kpis = await PontoService.getCompanyKPIs(companyId);
    const records = await PontoService.loadAllRecords();
    // Total: 3s (1s + 1s + 1s)
  };
  load();
}, [companyId]);
```

**Depois** (paralelo = rápido):
```typescript
const { data: employees } = useQuery({
  queryKey: ['employees', companyId],
  queryFn: () => PontoService.getAllEmployees(companyId),
});

const { data: kpis } = useQuery({
  queryKey: ['kpis', companyId],
  queryFn: () => PontoService.getCompanyKPIs(companyId),
});

const { data: records } = useQuery({
  queryKey: ['records'],
  queryFn: () => PontoService.loadAllRecords(),
});

// Total: 1s (paralelo) + cache
```

---

## 📋 IMPLEMENTAÇÃO POR COMPONENTE

### AdminView.tsx

**Mudanças Necessárias**:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const AdminView: React.FC<AdminViewProps> = ({ admin }) => {
  const queryClient = useQueryClient();

  // ✅ Substituir useState + useEffect por useQuery
  const { data: employees = [], isLoading: employeesLoading } = useQuery({
    queryKey: ['employees', admin.companyId],
    queryFn: () => PontoService.getAllEmployees(admin.companyId),
    staleTime: 5 * 60 * 1000,
  });

  // ✅ Substituir useState + useEffect por useQuery
  const { data: company } = useQuery({
    queryKey: ['company', admin.companyId],
    queryFn: () => PontoService.getCompany(admin.companyId),
    staleTime: 10 * 60 * 1000,
  });

  // ✅ Substituir handleCreateEmployee por useMutation
  const { mutate: createEmployee, isPending: isCreating } = useMutation({
    mutationFn: (data: CreateEmployeeData) => PontoService.createEmployee(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees', admin.companyId] });
      setShowCreateModal(false);
      setCreateForm({ nome: '', email: '', password: '', cargo: '', departmentId: '', role: 'employee' });
    },
    onError: (error) => {
      setCreateError(error.message);
    },
  });

  // ✅ Substituir handleImportEmployees por useMutation
  const { mutate: importEmployees, isPending: isImporting } = useMutation({
    mutationFn: (file: File) => PontoService.importEmployees(admin.companyId, file),
    onSuccess: (result) => {
      setImportResult(result);
      queryClient.invalidateQueries({ queryKey: ['employees', admin.companyId] });
      setShowImportModal(false);
    },
  });

  // ✅ Substituir handleConfirmAdjustment por useMutation
  const { mutate: adjustRecord, isPending: isAdjusting } = useMutation({
    mutationFn: () => PontoService.adjustRecord(admin, adjustingRecord!.id, adjustmentForm),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['records', adjustingRecord?.userId] });
      queryClient.invalidateQueries({ queryKey: ['kpis', admin.companyId] });
      setAdjustingRecord(null);
    },
  });

  // ✅ Substituir handleSaveSettings por useMutation
  const { mutate: saveSettings, isPending: isSavingSettings } = useMutation({
    mutationFn: () => PontoService.updateCompanySettings(admin.companyId, company!.settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company', admin.companyId] });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    },
  });

  return (
    // ... JSX com mutate() em vez de handleCreate(), etc.
  );
};
```

---

### AnalyticsView.tsx

```typescript
import { useQuery } from '@tanstack/react-query';

const AnalyticsView: React.FC<AnalyticsViewProps> = ({ admin }) => {
  // ✅ Substituir 4 useEffect por 4 useQuery
  const { data: kpis, isLoading: kpisLoading } = useQuery({
    queryKey: ['kpis', admin.companyId],
    queryFn: () => PontoService.getCompanyKPIs(admin.companyId),
    staleTime: 10 * 60 * 1000,
  });

  const { data: allRecords = [], isLoading: recordsLoading } = useQuery({
    queryKey: ['records', admin.companyId],
    queryFn: () => PontoService.loadAllRecords(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: departments = [], isLoading: deptsLoading } = useQuery({
    queryKey: ['departments', admin.companyId],
    queryFn: () => PontoService.getDepartments(admin.companyId),
    staleTime: 30 * 60 * 1000,
  });

  const { data: employees = [], isLoading: empLoading } = useQuery({
    queryKey: ['employees', admin.companyId],
    queryFn: () => PontoService.getAllEmployees(admin.companyId),
    staleTime: 5 * 60 * 1000,
  });

  const isLoading = kpisLoading || recordsLoading || deptsLoading || empLoading;

  // ... resto do componente
};
```

---

### useRecords.ts (Hook Customizado)

```typescript
import { useQuery } from '@tanstack/react-query';

export const useRecords = (userId: string | undefined, companyId: string | undefined) => {
  const { data: records = [], isLoading, error, refetch } = useQuery({
    queryKey: ['records', userId],
    queryFn: () => userId ? PontoService.getRecords(userId) : Promise.resolve([]),
    enabled: !!userId,
    staleTime: 1 * 60 * 1000, // 1 minuto
  });

  return { records, isLoading, error, refetch };
};
```

---

## 🔄 INVALIDAÇÃO DE CACHE

### Quando Invalidar

```typescript
const queryClient = useQueryClient();

// ✅ Após criar funcionário
queryClient.invalidateQueries({ queryKey: ['employees', companyId] });

// ✅ Após registrar ponto
queryClient.invalidateQueries({ queryKey: ['records', userId] });
queryClient.invalidateQueries({ queryKey: ['kpis', companyId] });

// ✅ Após ajustar registro
queryClient.invalidateQueries({ queryKey: ['records', userId] });
queryClient.invalidateQueries({ queryKey: ['kpis', companyId] });

// ✅ Invalidar tudo (último recurso)
queryClient.invalidateQueries();
```

---

## 📊 COMPARAÇÃO: ANTES vs DEPOIS

### Cenário: Abrir AdminView

**Antes** (sem React Query):
```
1. Carrega employees (1s)
2. Carrega company (0.5s)
3. Usuário clica em funcionário
4. Carrega records (1s)
5. Usuário muda de aba
6. Carrega employees NOVAMENTE (1s) ❌ Duplicado
7. Carrega kpis (1s)
8. Carrega records NOVAMENTE (1s) ❌ Duplicado

Total: 6.5s + requisições duplicadas
```

**Depois** (com React Query):
```
1. Carrega employees (1s) - cache
2. Carrega company (0.5s) - cache
3. Usuário clica em funcionário
4. Carrega records (1s) - cache
5. Usuário muda de aba
6. Retorna employees do cache (0ms) ✅ Sem requisição
7. Carrega kpis (1s) - cache
8. Retorna records do cache (0ms) ✅ Sem requisição

Total: 3.5s (46% redução)
```

---

## 🧪 TESTANDO

### Verificar Cache no DevTools

```typescript
// Instalar React Query DevTools
npm install @tanstack/react-query-devtools

// Em App.tsx
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {/* ... */}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
```

### Verificar Requisições

1. Abrir DevTools (F12)
2. Ir para aba "Network"
3. Observar que requisições duplicadas não aparecem
4. Clicar em "React Query" DevTools para ver cache

---

## ⚠️ ARMADILHAS COMUNS

### ❌ Não fazer:

```typescript
// ❌ ERRADO: Criar novo queryClient a cada render
const queryClient = new QueryClient();

// ❌ ERRADO: Não invalidar cache após mutação
const { mutate } = useMutation({
  mutationFn: createEmployee,
  // Falta: onSuccess com invalidateQueries
});

// ❌ ERRADO: staleTime muito curto
const { data } = useQuery({
  queryKey: ['employees'],
  queryFn: fetchEmployees,
  staleTime: 1000, // 1 segundo = muitas requisições
});

// ❌ ERRADO: Não usar queryKey corretamente
const { data } = useQuery({
  queryKey: ['employees'], // Falta companyId
  queryFn: () => fetchEmployees(companyId),
});
```

### ✅ Fazer:

```typescript
// ✅ CORRETO: Criar queryClient uma vez
const queryClient = new QueryClient();

// ✅ CORRETO: Invalidar cache após mutação
const { mutate } = useMutation({
  mutationFn: createEmployee,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['employees', companyId] });
  },
});

// ✅ CORRETO: staleTime apropriado
const { data } = useQuery({
  queryKey: ['employees'],
  queryFn: fetchEmployees,
  staleTime: 5 * 60 * 1000, // 5 minutos
});

// ✅ CORRETO: queryKey inclui dependências
const { data } = useQuery({
  queryKey: ['employees', companyId],
  queryFn: () => fetchEmployees(companyId),
});
```

---

## 📈 MÉTRICAS ESPERADAS

| Métrica | Antes | Depois | Melhoria |
|---------|-------|--------|----------|
| Requisições por página | 6+ | 2-3 | **60%** |
| Tempo carregamento | 5-8s | 1-2s | **75%** |
| Requisições duplicadas | 3-5 | 0 | **100%** |
| Uso de memória | 150MB | 80MB | **47%** |

---

## 🚀 PRÓXIMOS PASSOS

1. ✅ Instalar React Query
2. ✅ Configurar QueryClient
3. ✅ Envolver App com QueryClientProvider
4. ✅ Migrar AdminView.tsx
5. ✅ Migrar AnalyticsView.tsx
6. ✅ Migrar useRecords.ts
7. ✅ Testar com DevTools
8. ✅ Validar performance

---

## 📚 REFERÊNCIAS

- [React Query Docs](https://tanstack.com/query/latest)
- [useQuery API](https://tanstack.com/query/latest/docs/react/reference/useQuery)
- [useMutation API](https://tanstack.com/query/latest/docs/react/reference/useMutation)
- [Query Invalidation](https://tanstack.com/query/latest/docs/react/guides/important-defaults#caching-examples)

