# Notificações: Admin Recebe Notificação de Solicitações

## Problema
Quando um colaborador criava uma solicitação, apenas o colaborador recebia notificação. O admin/RH não era notificado.

## Causa
O código criava notificação apenas para o colaborador (`userId: user.id`), não para os admins/RH da empresa.

## Solução Implementada

### Estratégia: Notificar todos os admins/RH

Quando um colaborador cria uma solicitação, agora:
1. Colaborador recebe notificação: "Solicitação enviada"
2. Todos os admins/RH da empresa recebem notificação: "Nova solicitação"

### Código Atualizado

**src/pages/Requests.tsx - handleSubmit():**

```typescript
// Notificar o colaborador
await NotificationService.create({
  userId: user.id,
  type: 'info',
  title: 'Solicitação enviada',
  message: 'Sua solicitação foi registrada e aguarda aprovação.',
  metadata: { requestId: id },
});

// Notificar todos os admins/RH da empresa
const admins = await db.select('users', [
  { column: 'company_id', operator: 'eq', value: user.companyId },
  { column: 'role', operator: 'in', value: ['admin', 'hr'] },
]);

for (const admin of admins || []) {
  try {
    await NotificationService.create({
      userId: admin.id,
      type: 'info',
      title: 'Nova solicitação',
      message: `${user.nome} enviou uma nova solicitação de ${form.type === 'adjustment' ? 'ajuste de ponto' : form.type === 'vacation' ? 'férias' : 'mudança de turno'}.`,
      metadata: { requestId: id },
      actionUrl: '/requests',
    });
  } catch (e) {
    console.error('Erro ao notificar admin:', e);
  }
}
```

## Fluxo de Funcionamento

```
Colaborador cria solicitação
    ↓
Solicitação salva no banco
    ↓
1. Notificação para colaborador
   └─ "Solicitação enviada"
    ↓
2. Buscar todos os admins/RH da empresa
    ↓
3. Criar notificação para cada admin/RH
   └─ "Nova solicitação de [colaborador]"
    ↓
Admin/RH recebe notificação no sino
```

## Notificações Criadas

### Para o Colaborador:
- **Título:** "Solicitação enviada"
- **Mensagem:** "Sua solicitação foi registrada e aguarda aprovação."
- **Tipo:** info
- **Ação:** Nenhuma

### Para o Admin/RH:
- **Título:** "Nova solicitação"
- **Mensagem:** "[Nome do colaborador] enviou uma nova solicitação de [tipo]."
- **Tipo:** info
- **Ação:** Link para página de Solicitações

## Tipos de Solicitação

A mensagem muda de acordo com o tipo:
- `adjustment` → "ajuste de ponto"
- `vacation` → "férias"
- `shift_change` → "mudança de turno"

## Teste

1. **Fazer deploy** da aplicação
2. **Fazer login como colaborador**
3. **Ir para Solicitações**
4. **Clicar em "Nova solicitação"**
5. **Preencher e enviar**
6. **Fazer login como admin/RH**
7. **Clicar no sino de notificações**
8. **Verificar se há notificação "Nova solicitação"**

## Comportamento Esperado

### Colaborador:
- ✅ Vê notificação "Solicitação enviada"
- ✅ Notificação desaparece ao clicar X

### Admin/RH:
- ✅ Recebe notificação "Nova solicitação"
- ✅ Notificação tem link para página de Solicitações
- ✅ Pode clicar no link para ir direto para a solicitação
- ✅ Pode deletar a notificação clicando X

## Vantagens

✅ **Admin notificado imediatamente** - Recebe notificação no sino
✅ **Múltiplos admins** - Todos os admins/RH recebem notificação
✅ **Link direto** - Notificação tem link para página de Solicitações
✅ **Informação clara** - Mensagem mostra nome do colaborador e tipo de solicitação
✅ **Sem bloquear** - Notificações são criadas em background

## Resumo

Agora quando um colaborador cria uma solicitação:
1. Colaborador recebe confirmação
2. Todos os admins/RH da empresa recebem notificação
3. Admin pode clicar no link para ir direto para a solicitação
4. Admin pode deletar a notificação após revisar
