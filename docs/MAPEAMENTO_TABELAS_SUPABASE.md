# Mapeamento: nomes no Supabase × nomes que o código usa

O projeto acessa as tabelas pelo **nome interno no PostgreSQL** (em inglês). Abaixo está o mapeamento entre o que aparece na interface e o nome que o código espera.

---

## Tabelas que o código usa (nome exato no banco)

| O que você vê (Supabase)   | Nome que o código usa no banco | Status |
|----------------------------|--------------------------------|--------|
| ausências                 | **absences**                   | ✅ |
| registros de auditoria     | **audit_logs**                 | ✅ |
| empresas                   | **companies**                  | ✅ |
| departamentos              | **departments**                | ✅ |
| dispositivos               | **devices**                    | ✅ |
| convites_para_funcionários | **employee_invites**           | ✅ |
| notificações               | **notifications**              | ✅ |
| solicitações               | **requests**                   | ✅ |
| configurações_do_sistema  | **system_settings**            | ✅ |
| ajustes de tempo           | **time_adjustments**           | ✅ |
| saldo de tempo             | **time_balance**               | ✅ (nome com _) |
| registros de tempo         | **time_records**               | ✅ |
| configurações_do_usuário   | **user_settings**              | ✅ |
| Usuários                   | **users**                      | ✅ |
| férias                     | **vacations**                  | ✅ |
| locais_de_trabalho         | **work_locations**             | ✅ |

---

## Escalas e horários (atenção)

O código das páginas **Admin > Horários** e **Admin > Escalas** usa **duas** tabelas com estes nomes:

| Uso no projeto | Nome que o código usa | Sua lista (provável correspondência) |
|----------------|----------------------|--------------------------------------|
| **Admin > Horários** (entrada, saída, intervalo, tolerância) | **work_shifts** | turnos_de_trabalho |
| **Admin > Escalas** (nome, dias da semana, vínculo a um horário) | **schedules**   | horários (7 colunas) ou outra |

Você tem três tabelas relacionadas:

- **horários** (7 colunas)
- **horários_de_trabalho** (9 colunas)
- **turnos_de_trabalho** (9 colunas)

Para o projeto funcionar sem alterar código:

1. A tabela de **tipos de jornada** (entrada, saída, intervalo, tolerância) deve se chamar **work_shifts**.  
   - Se no banco estiver como **turnos_de_trabalho**, renomeie para **work_shifts** ou crie uma view com esse nome.

2. A tabela de **escalas** (nome, dias, vínculo a um horário) deve se chamar **schedules**.  
   - Se no banco estiver como **horários**, renomeie para **schedules** ou crie uma view.

3. **horários_de_trabalho** não é usada pelo fluxo Admin atual; o código usa **work_shifts** e **schedules**. Pode manter para outro uso ou migrar dados e desativar.

---

## Tabela “agendamentos_do_usuário”

- Nome no código (se for usado em outro fluxo): **user_schedules**.
- Nas páginas **Admin > Funcionários** e **Admin > Escalas**, o vínculo funcionário ↔ escala é feito por **users.schedule_id** (coluna em **users** apontando para **schedules**), não pela tabela `user_schedules`.
- Ou seja: para o fluxo Admin/Funcionário, o essencial é ter **users.schedule_id** e a tabela **schedules**. A tabela **agendamentos_do_usuário** (user_schedules) pode existir para outro recurso, mas não é usada nessas páginas.

---

## Como verificar o nome real no PostgreSQL

No Supabase: **Table Editor** → clique na tabela → o nome que aparece no topo ou na URL é o nome real da tabela no banco (ex.: `work_shifts`, `turnos_de_trabalho`, etc.).

Se o nome real for em português (ex.: `turnos_de_trabalho`), você tem duas opções:

1. **Renomear no banco** para o nome que o código usa:
   - `turnos_de_trabalho` → **work_shifts**
   - `horários` (escalas) → **schedules**
2. **Ou** criar **views** com o nome em inglês apontando para as tabelas em português, por exemplo:
   - `CREATE VIEW work_shifts AS SELECT * FROM turnos_de_trabalho;`
   - `CREATE VIEW schedules AS SELECT * FROM horários;`  
   (ajuste “horários” para o nome real da tabela de escalas, se for outro.)

---

## Checklist rápido

- [ ] Tabela de saldo de horas no banco se chama **time_balance** (não “saldo de tempo” com espaço).
- [ ] Existe uma tabela **work_shifts** (ou view) para Admin > Horários.
- [ ] Existe uma tabela **schedules** (ou view) para Admin > Escalas.
- [ ] Na tabela **users** existe a coluna **schedule_id** (FK para `schedules`).

Com isso, as páginas do projeto ficam alinhadas com as tabelas do Supabase.
