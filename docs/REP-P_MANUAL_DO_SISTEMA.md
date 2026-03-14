# Manual do Sistema – SmartPonto REP-P

## 1. Visão geral

O SmartPonto é um sistema de controle de ponto eletrônico que opera como **REP-P** (Registrador Eletrônico de Ponto via Programa), em conformidade com a **Portaria ME nº 671/2021**.

### Principais características

- Registro de ponto (entrada, saída, pausa) com NSR e hash
- Comprovante de registro de ponto (dados obrigatórios da Portaria)
- Exportação AFD e AEJ para fiscalização
- Registros imutáveis (correções apenas via Ajustes de Ponto)
- Validação de integridade (cadeia NSR e hash)
- Espelho de ponto e relatórios

## 2. Registro de ponto (funcionário)

1. Acesse **Registrar Ponto** (menu funcionário).
2. Escolha o tipo: **Entrada**, **Saída** ou **Pausa**, conforme a sequência do dia.
3. O sistema valida a sequência (ex.: não permite duas entradas seguidas).
4. Após registrar, o ponto é gravado com NSR e hash; um comprovante é gerado no servidor.

**Observação:** Registros REP-P não podem ser alterados nem excluídos. Em caso de erro, utilize **Ajustes de Ponto** para solicitar correção.

## 3. Painel de fiscalização (admin)

Em **Fiscalização REP-P** o administrador pode:

- **Exportar AFD:** arquivo TXT (Arquivo Fonte de Dados) para fiscalização.
- **Exportar AEJ:** arquivo JSON (Arquivo Eletrônico de Jornada) com registros e resumo (horas trabalhadas, extras, faltas).
- **Validar integridade:** verificação da sequência NSR e da cadeia de hash. Em caso de falha, o sistema indica inconsistências.

Links rápidos para **Espelho de Ponto** e **Relatório de Inconsistências** também estão disponíveis nessa tela.

## 4. Espelho de ponto

- **Admin:** Espelho de Ponto (menu) lista registros por funcionário e período, com totais de horas e status.
- **Funcionário:** Espelho de Ponto (menu funcionário) mostra apenas os próprios registros.

Para obter PDF: use a opção de impressão do navegador (Ctrl+P) e escolha “Salvar como PDF”.

## 5. Ajustes de ponto

Correções de horário são feitas somente por meio de **Ajustes de Ponto**:

1. Funcionário solicita ajuste informando data, horário desejado e motivo.
2. Admin/RH aprova ou rejeita.
3. O registro original em `time_records` **não é alterado** (REP-P). O ajuste aprovado fica registrado em `time_adjustments` e deve ser considerado nos cálculos de jornada e relatórios.

## 6. Segurança e LGPD

- Funcionário acessa apenas seus próprios registros e comprovantes.
- Admin acessa dados da empresa (RLS no banco).
- Ações administrativas podem ser registradas em log de auditoria.
- Dados sensíveis devem ser tratados conforme política de privacidade e LGPD.

## 7. Suporte e documentação técnica

- **Arquitetura:** ver `docs/REP-P_ARQUITETURA.md`
- **Preparação INPI:** ver `docs/REP-P_PREPARACAO_INPI.md`
- **Termo de Responsabilidade Técnica:** ver `docs/REP-P_TERMO_RESPONSABILIDADE_TECNICA.md`
