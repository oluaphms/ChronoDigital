# Preparação para Registro no INPI – SmartPonto REP-P

Para que o software seja reconhecido como programa de computador e, quando aplicável, utilizado como REP-P em contexto de fiscalização, recomenda-se o registro no **INPI** (Instituto Nacional da Propriedade Industrial).

## 1. Documentos e informações úteis

- **Versão do sistema:** indicar número ou data da versão (ex.: 1.0, 2025.03).
- **Hash do software:** gerar hash (SHA-256) do código-fonte ou do pacote de distribuição para atestar integridade na data do registro.
- **Documentação:** este projeto inclui:
  - `REP-P_TERMO_RESPONSABILIDADE_TECNICA.md`
  - `REP-P_MANUAL_DO_SISTEMA.md`
  - `REP-P_ARQUITETURA.md`
  - `REP-P_PREPARACAO_INPI.md` (este arquivo)

## 2. Como gerar hash do software

Exemplo (linha de comando), excluindo pastas não essenciais:

```bash
# Exemplo: hash do diretório src (código principal)
find src -type f -name "*.ts" -o -name "*.tsx" | sort | xargs cat | sha256sum

# Ou do arquivo compactado do projeto (ajuste o nome do zip)
zip -r smartponto-src.zip src api services supabase/migrations docs/REP-P_*.md -x "*.git*" "node_modules/*"
sha256sum smartponto-src.zip
```

Guarde o hash e a data em que foi gerado para referência no processo de registro.

## 3. O que o INPI costuma solicitar (visão geral)

- Identificação do autor/titular
- Nome e versão do programa
- Resumo do que o programa faz
- Atestado de autoria/originalidade (conforme orientações do INPI)
- Documentação técnica e/ou manual (os arquivos REP-P_*.md servem de base)
- Comprovante de pagamento de taxas (conforme tabela vigente)

Consulte o site do INPI para o passo a passo atualizado e formulários do registro de programa de computador.

## 4. Pós-registro

- Manter cópia do certificado e do hash do código na versão registrada.
- Em atualizações relevantes, considerar novo registro ou averbação, conforme prática do INPI.

---

*Este documento é apenas uma preparação interna; o processo oficial deve seguir as regras e formulários do INPI.*
