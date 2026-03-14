# Termo de Responsabilidade Técnica – SmartPonto REP-P

**Sistema:** SmartPonto – Registrador Eletrônico de Ponto via Programa (REP-P)  
**Referência:** Portaria ME nº 671, de 28 de maio de 2021  
**Data:** 2025

---

## 1. Identificação do sistema

- **Denominação:** SmartPonto
- **Tipo:** Software de registro de ponto eletrônico (REP-P), executado em servidor/nuvem
- **Finalidade:** Registro de jornada de trabalho, geração de comprovantes, arquivos fiscais (AFD/AEJ) e espelho de ponto, em conformidade com a legislação trabalhista

## 2. Responsável técnico

O desenvolvedor responsável pelo sistema atesta que o SmartPonto foi desenvolvido e mantido de acordo com as especificações técnicas e exigências da Portaria 671/2021, no que se aplica a registradores eletrônicos de ponto via programa.

## 3. Funcionalidades atestadas

- **Registro de ponto:** Marcações de entrada, saída e pausa, sem possibilidade de alteração ou exclusão fraudulenta dos registros
- **NSR (Número Sequencial de Registro):** Atribuição de número sequencial único por empresa
- **Integridade:** Cadeia de hash (SHA-256) por marcação, com campo `previous_hash` para garantia de não alteração
- **Imutabilidade:** Bloqueio de UPDATE e DELETE em registros de ponto no banco de dados (correções apenas via tabela de ajustes, com histórico)
- **Comprovante de registro:** Geração de comprovante contendo NSR, empresa, CNPJ, local, trabalhador, CPF, data, hora e hash
- **Arquivos fiscais:** Exportação AFD (Arquivo Fonte de Dados) e AEJ (Arquivo Eletrônico de Jornada)
- **Espelho de ponto:** Relatório com entradas, saídas, intervalo, horas normais, extras, faltas, DSR e saldo de banco de horas
- **Auditoria:** Tabela de logs de auditoria para ações administrativas
- **Sincronização de hora:** Verificação de tolerância em relação à hora legal brasileira (variação máxima considerada: 30 segundos)

## 4. Limitações e uso

- O sistema destina-se a empresas que adotem registro de ponto eletrônico e que queiram utilizar um REP-P em conformidade com a Portaria 671.
- A responsabilidade pelo uso correto do sistema e pela guarda dos arquivos fiscais é do empregador.
- Este termo não substitui obrigações legais de registro de programa de computador perante o INPI, quando aplicável.

## 5. Atestado

Atesto que as funcionalidades descritas foram implementadas no sistema SmartPonto e que o software opera como REP-P nos termos da Portaria 671/2021, na medida em que:

1. Registra marcações sem permitir alteração ou exclusão dos registros originais  
2. Gera NSR e hash por marcação  
3. Emite comprovante de registro de ponto  
4. Permite exportação de AFD e AEJ para fiscalização  
5. Mantém trilha de auditoria e integridade dos dados  

---

*Documento gerado para fins de conformidade técnica com a Portaria 671/2021.*
