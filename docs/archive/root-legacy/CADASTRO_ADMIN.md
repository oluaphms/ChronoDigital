# 👥 Cadastro de Funcionários - SmartPonto

## 📋 Visão Geral

No SmartPonto, **apenas administradores** podem cadastrar funcionários. Isso garante:
- ✅ **Segurança**: Controle total sobre quem tem acesso ao sistema
- ✅ **Conformidade**: Facilita auditoria e rastreabilidade
- ✅ **Organização**: Funcionários são vinculados corretamente à empresa
- ✅ **Padrão empresarial**: Alinhado com práticas de apps B2B

---

## 🎯 Formas de Cadastro

### 1. **Cadastro Manual** (via Dashboard Admin)

O administrador pode cadastrar funcionários individualmente através da interface:

1. Acesse **Painel Gestor** → **Pessoal**
2. Clique em **"Cadastrar Funcionário"**
3. Preencha o formulário:
   - **Nome completo**
   - **Email** (será usado para login)
   - **Senha** (o funcionário pode alterar depois)
   - **Cargo**
   - **Departamento** (opcional)
   - **Role** (employee, supervisor, hr, admin)
4. Clique em **"Criar Funcionário"**

O sistema irá:
- Criar usuário no Supabase Auth
- Criar registro na tabela `users` com `company_id` do admin
- Enviar email de confirmação (se configurado)

---

### 2. **Importação em Massa** (via Planilha)

Para cadastrar múltiplos funcionários de uma vez:

1. Acesse **Painel Gestor** → **Pessoal**
2. Clique em **"Importar Planilha"**
3. Baixe o **modelo de planilha** (Excel ou CSV)
4. Preencha a planilha com os dados dos funcionários
5. Faça upload da planilha
6. Revise os dados e confirme a importação

#### 📊 Formato da Planilha

A planilha deve ter as seguintes colunas:

| Nome | Email | Senha | Cargo | Departamento | Role |
|------|-------|-------|-------|--------------|------|
| João Silva | joao@empresa.com | senha123 | Desenvolvedor | TI | employee |
| Maria Santos | maria@empresa.com | senha456 | Gerente | RH | supervisor |

**Colunas obrigatórias:**
- `Nome` - Nome completo do funcionário
- `Email` - Email único (será usado para login)
- `Senha` - Senha inicial (o funcionário pode alterar)
- `Cargo` - Cargo/função

**Colunas opcionais:**
- `Departamento` - ID ou nome do departamento
- `Role` - employee (padrão), supervisor, hr, ou admin

**Formatos suportados:**
- Excel (.xlsx)
- CSV (.csv)

---

## 🔧 Processo Técnico

### Como Funciona Internamente

1. **Criação no Supabase Auth**
   ```typescript
   await auth.signUp(email, password, {
     nome,
     company_id: admin.companyId
   });
   ```

2. **Criação na Tabela `users`**
   ```sql
   INSERT INTO users (id, nome, email, cargo, role, company_id, ...)
   VALUES (
     (SELECT id FROM auth.users WHERE email = '...'),
     'Nome',
     'email@empresa.com',
     'Cargo',
     'employee',
     'comp_1',
     ...
   );
   ```

3. **Validações**
   - Email único (não pode já existir)
   - Senha com mínimo de 6 caracteres
   - `company_id` deve existir na tabela `companies`
   - `role` deve ser válido (employee, supervisor, hr, admin)

---

## 📝 Exemplo de Planilha

### Excel/CSV Modelo

```csv
Nome,Email,Senha,Cargo,Departamento,Role
João Silva,joao.silva@empresa.com,senha123,Desenvolvedor,TI,employee
Maria Santos,maria.santos@empresa.com,senha456,Gerente RH,RH,supervisor
Pedro Costa,pedro.costa@empresa.com,senha789,Analista,Financeiro,employee
Ana Lima,ana.lima@empresa.com,senha012,Coordenadora,Operações,hr
```

**Nota**: A primeira linha deve conter os cabeçalhos das colunas.

---

## ✅ Validações e Regras

### Email
- Deve ser um email válido
- Deve ser único (não pode já existir no sistema)
- Será usado para login

### Senha
- Mínimo de 6 caracteres
- Recomendado: letras, números e caracteres especiais
- O funcionário pode alterar depois do primeiro login

### Cargo
- Campo obrigatório
- Texto livre

### Departamento
- Opcional
- Se não informado, será vazio (`''`)

### Role
- Valores permitidos: `employee`, `supervisor`, `hr`, `admin`
- Padrão: `employee`
- **Atenção**: `admin` dá acesso completo ao sistema

---

## 🚨 Tratamento de Erros

### Erros Comuns na Importação

1. **Email duplicado**
   - **Erro**: "Este email já está em uso"
   - **Solução**: Verifique se o funcionário já foi cadastrado ou use outro email

2. **Senha muito fraca**
   - **Erro**: "Senha muito fraca"
   - **Solução**: Use senhas com no mínimo 6 caracteres

3. **Formato de planilha inválido**
   - **Erro**: "Colunas obrigatórias faltando"
   - **Solução**: Verifique se a planilha tem as colunas: Nome, Email, Senha, Cargo

4. **Linhas com dados inválidos**
   - **Erro**: "Linha X: [descrição do erro]"
   - **Solução**: Corrija os dados na planilha e tente novamente

### Relatório de Importação

Após a importação, você verá:
- ✅ **Sucesso**: Quantos funcionários foram criados
- ❌ **Erros**: Linhas que falharam e o motivo
- 📊 **Total**: Total processado vs. total criado

---

## 🔐 Segurança

- **Senhas**: São armazenadas de forma segura no Supabase Auth (hash bcrypt)
- **Auditoria**: Todas as criações são registradas em `audit_logs`
- **Permissões**: Apenas usuários com `role: 'admin'` podem cadastrar funcionários
- **Validação**: Dados são validados antes de criar (Zod schemas)

---

## 📚 Recursos Relacionados

- **`CRIAR_USUARIO_DESENVOLVEDOR.md`**: Exemplo de criação manual via SQL
- **`CONFIGURAR_SUPABASE.md`**: Configuração do banco de dados
- **`SUPABASE_TABELAS.md`**: Estrutura das tabelas

---

## 🆘 Suporte

Se tiver problemas:
1. Verifique os logs de auditoria (Painel Gestor → Logs)
2. Verifique se o Supabase está configurado corretamente
3. Verifique se você tem permissão de admin
4. Consulte a documentação do Supabase: https://supabase.com/docs

---

**Última atualização**: Janeiro 2026
