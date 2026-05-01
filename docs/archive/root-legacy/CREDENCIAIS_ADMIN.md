# 🔐 Credenciais do Administrador Padrão - SmartPonto

## 📋 Informações de Login

### Usuário Administrador Padrão

- **Email**: `desenvolvedor@smartponto.com`
- **Senha**: `dev123`
- **Nome**: Desenvolvedor
- **Cargo**: Desenvolvedor Full Stack
- **Role**: `admin` (acesso completo)

---

## 🚀 Como Fazer Login

1. Abra o app SmartPonto
2. Escolha **"Painel Gestor"** ou **"Acesso Funcionário"** (ambos funcionam para admin)
3. Digite:
   - **Email/Usuário**: `desenvolvedor` ou `desenvolvedor@smartponto.com`
   - **Senha**: `dev123`
4. Clique em **"Entrar no Sistema"**

---

## ✅ Permissões do Administrador

Com `role: 'admin'`, você tem acesso a **todas** as funcionalidades:

- ✅ **Dashboard** - Registrar ponto, ver histórico pessoal
- ✅ **Meu Histórico** - Ver todos os seus registros de ponto
- ✅ **Gestão Geral** (Painel Admin) - Acesso completo:
  - Gerenciar funcionários (cadastrar, importar planilha)
  - Ver relatórios e analytics
  - Ajustar pontos de funcionários
  - Ver logs de auditoria
  - Configurar empresa (geofence, horários, etc.)
- ✅ **Meu Perfil** - Editar informações pessoais, alterar senha, preferências

---

## 🔧 Criar o Usuário Administrador

Se o usuário ainda não foi criado, siga as instruções em:

📄 **`CRIAR_USUARIO_DESENVOLVEDOR.md`**

Resumo rápido:
1. Criar usuário no Supabase Dashboard (Authentication → Users)
2. Executar SQL script `criar_usuario_desenvolvedor.sql`

---

## 🔒 Segurança

⚠️ **IMPORTANTE**: 
- Altere a senha padrão após o primeiro login
- Use uma senha forte (mínimo 6 caracteres, recomendado: letras, números e símbolos)
- A senha pode ser alterada em **Meu Perfil** → **Alterar Senha**

---

## 📝 Notas

- O email pode ser digitado como `desenvolvedor` (o app completa automaticamente)
- Com role `admin`, você tem acesso a todas as funcionalidades do sistema
- Você pode criar outros administradores através do **Painel Gestor** → **Pessoal** → **Cadastrar Funcionário** (selecione role "Administrador")

---

**Última atualização**: Janeiro 2026
