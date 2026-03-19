
# Debugging Rules

- Sempre identificar a CAUSA do erro, não apenas corrigir o sintoma
- Ler stack trace completo antes de sugerir solução
- Nunca assumir comportamento sem verificar o código real
- Evitar soluções genéricas

## React
- Verificar dependências do useEffect
- Evitar loops infinitos
- Confirmar se hooks estão sendo usados dentro de componentes

## API
- Validar request e response
- Verificar erros silenciosos
- Sempre usar try/catch

## Regra geral
- Se algo quebra o sistema inteiro, isolar antes de corrigir