/**
 * Serviço de importação de funcionários em massa (SmartPonto).
 * Validação CPF/email, mapeamento de campos, inserção em lote, log de erros.
 */

import { db, supabase, checkSupabaseConfigured, isSupabaseConfigured } from '../../services/supabaseClient';

export const REQUIRED_FIELDS = ['nome_completo', 'cpf', 'data_admissao'] as const;
export const TEMPLATE_HEADERS = [
  'nome_completo',
  'cpf',
  'email',
  'telefone',
  'departamento',
  'cargo',
  'data_admissao',
  'tipo_jornada',
  'salario',
  'status',
  'matricula',
  'pis',
  'centro_custo',
  'supervisor',
] as const;

export interface ImportRow {
  /** Alias ocasional em planilhas */
  nome?: string;
  nome_completo?: string;
  cpf?: string;
  email?: string;
  telefone?: string;
  departamento?: string;
  cargo?: string;
  data_admissao?: string;
  tipo_jornada?: string;
  salario?: string;
  status?: string;
  matricula?: string;
  pis?: string;
  centro_custo?: string;
  supervisor?: string;
}

export type ValidatedRow = ImportRow & {
  _rowIndex: number;
  _valid: boolean;
  _errors: string[];
};

export interface MappedUser {
  id?: string;
  company_id: string;
  nome: string;
  email: string;
  role: 'employee';
  status: string;
  cpf: string | null;
  phone: string | null;
  cargo: string;
  department_id: string | null;
  admissao: string | null;
  pis_pasep: string | null;
  numero_folha: string | null;
}

export interface ImportLogResult {
  logId: string;
  totalRecords: number;
  successRecords: number;
  errorRecords: number;
  errors: { rowNumber: number; errorMessage: string; data: ImportRow }[];
}

/** Remove caracteres não numéricos do CPF. */
export function stripCpf(cpf: string): string {
  return (cpf || '').replace(/\D/g, '');
}

/** Validação de CPF (algoritmo oficial). */
export function isValidCpf(cpf: string): boolean {
  const s = stripCpf(cpf);
  if (s.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(s[i], 10) * (10 - i);
  let digit = (sum * 10) % 11;
  if (digit === 10) digit = 0;
  if (digit !== parseInt(s[9], 10)) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(s[i], 10) * (11 - i);
  digit = (sum * 10) % 11;
  if (digit === 10) digit = 0;
  if (digit !== parseInt(s[10], 10)) return false;
  return true;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test((email || '').trim());
}

/** Valida uma linha da planilha e retorna erros. */
function validateEmployeeImportRowWithCounts(
  row: ImportRow,
  rowIndex: number,
  existingCpfs: Set<string>,
  existingEmails: Set<string>,
  cpfCountInSheet: Map<string, number>,
  emailCountInSheet: Map<string, number>
): ValidatedRow {
  const errors: string[] = [];
  const nome = (row.nome_completo ?? row.nome ?? '').toString().trim();
  const cpfRaw = (row.cpf ?? '').toString().trim();
  const cpf = stripCpf(cpfRaw);
  const dataAdmissao = (row.data_admissao ?? '').toString().trim();
  const email = (row.email ?? '').toString().trim().toLowerCase();

  if (!nome) errors.push('Nome completo é obrigatório');
  if (!cpf) errors.push('CPF é obrigatório');
  else {
    if (!isValidCpf(cpfRaw)) errors.push('CPF inválido');
    else if (existingCpfs.has(cpf)) errors.push('CPF já cadastrado');
    else if ((cpfCountInSheet.get(cpf) ?? 0) > 1) errors.push('CPF duplicado na planilha');
  }
  if (!dataAdmissao) errors.push('Data de admissão é obrigatória');
  else {
    const d = parseDate(dataAdmissao);
    if (!d || isNaN(d.getTime())) errors.push('Data de admissão inválida');
  }
  if (email) {
    if (!isValidEmail(email)) errors.push('E-mail inválido');
    else if (existingEmails.has(email)) errors.push('E-mail já cadastrado');
    else if ((emailCountInSheet.get(email) ?? 0) > 1) errors.push('E-mail duplicado na planilha');
  }

  return {
    ...row,
    _rowIndex: rowIndex,
    _valid: errors.length === 0,
    _errors: errors,
  };
}

/** Valida todas as linhas e verifica duplicidade no banco (CPF e email) e na planilha. */
export async function validateEmployeeImport(
  rows: ImportRow[],
  companyId: string
): Promise<ValidatedRow[]> {
  const existingCpfs = new Set<string>();
  const existingEmails = new Set<string>();

  if (isSupabaseConfigured() && companyId) {
    try {
      const [empRows, userRows] = await Promise.all([
        db.select('employees', [{ column: 'company_id', operator: 'eq', value: companyId }]) as Promise<{ cpf?: string; email?: string }[]>,
        db.select('users', [{ column: 'company_id', operator: 'eq', value: companyId }]) as Promise<{ cpf?: string; email?: string }[]>,
      ]);
      (empRows ?? []).forEach((r) => {
        if (r.cpf) existingCpfs.add(stripCpf(r.cpf));
        if (r.email) existingEmails.add(r.email.trim().toLowerCase());
      });
      (userRows ?? []).forEach((r) => {
        if (r.cpf) existingCpfs.add(stripCpf(r.cpf));
        if (r.email) existingEmails.add(r.email.trim().toLowerCase());
      });
    } catch {
      // continua com conjuntos vazios
    }
  }

  const cpfCountInSheet = new Map<string, number>();
  const emailCountInSheet = new Map<string, number>();
  rows.forEach((row) => {
    const cpf = stripCpf((row.cpf ?? '').toString());
    const email = (row.email ?? '').toString().trim().toLowerCase();
    if (cpf) cpfCountInSheet.set(cpf, (cpfCountInSheet.get(cpf) ?? 0) + 1);
    if (email) emailCountInSheet.set(email, (emailCountInSheet.get(email) ?? 0) + 1);
  });

  return rows.map((row, i) =>
    validateEmployeeImportRowWithCounts(
      row,
      i + 2,
      existingCpfs,
      existingEmails,
      cpfCountInSheet,
      emailCountInSheet
    )
  );
}

function countInSheet(rows: ImportRow[], field: string, value: string): number {
  const v = value.toLowerCase();
  return rows.filter((r) => (r[field] ?? '').toString().trim().toLowerCase() === v).length;
}

function parseDate(s: string): Date | null {
  const t = s.trim();
  if (!t) return null;
  const iso = t.includes('T') ? t : t.replace(/(\d{4})-(\d{2})-(\d{2})/, '$1-$2-$3');
  const d = new Date(iso);
  if (!isNaN(d.getTime())) return d;
  const br = t.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (br) return new Date(parseInt(br[3], 10), parseInt(br[2], 10) - 1, parseInt(br[1], 10));
  return null;
}

/** Mapeia linha da planilha para estrutura users (e trigger cria employees). */
export function mapImportFields(row: ImportRow, companyId: string): MappedUser {
  const nome = (row.nome_completo ?? row.nome ?? '').toString().trim() || 'Sem nome';
  const cpfStr = (row.cpf ?? '').toString().trim();
  const emailRaw = (row.email ?? '').toString().trim().toLowerCase();
  const email = emailRaw || (stripCpf(cpfStr) ? `import.${stripCpf(cpfStr)}@temp.local` : `import.${crypto.randomUUID().slice(0, 8)}@temp.local`);
  const cpf = cpfStr ? stripCpf(cpfStr) : null;
  const dataAdm = (row.data_admissao ?? '').toString().trim();
  const admissao = dataAdm ? (parseDate(dataAdm)?.toISOString().slice(0, 10) ?? null) : null;
  const status = (row.status ?? 'active').toString().trim().toLowerCase();
  const statusFinal = status === 'inativo' || status === 'inactive' ? 'inactive' : 'active';

  return {
    company_id: companyId,
    nome,
    email,
    role: 'employee',
    status: statusFinal,
    cpf: cpf ? (cpf.length === 11 ? cpf : null) : null,
    phone: (row.telefone ?? '').toString().trim() || null,
    cargo: (row.cargo ?? '').toString().trim() || 'Colaborador',
    department_id: null,
    admissao,
    pis_pasep: (row.pis ?? '').toString().trim() || null,
    numero_folha: (row.matricula ?? '').toString().trim() || null,
  };
}

const BATCH_SIZE = 500;

/**
 * Importa funcionários em lote: valida, remove inválidos, insere em users (trigger sincroniza employees), grava log e erros.
 * Não cria auth (login); para ativar acesso use convite por e-mail no cadastro do funcionário.
 */
export async function importEmployeesBatch(
  validatedRows: ValidatedRow[],
  companyId: string,
  importedBy: string
): Promise<ImportLogResult> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase não configurado.');
  }

  const toInsert = validatedRows.filter((r) => r._valid);
  if (toInsert.length > 0) {
    const { evaluateEmployeeSeat, fetchCompanyPlan, countActiveEmployeesForCompany } = await import(
      '../../services/tenantPlan.service'
    );
    const plan = await fetchCompanyPlan(companyId);
    const current = await countActiveEmployeesForCompany(companyId);
    const ev = evaluateEmployeeSeat(plan, current, toInsert.length);
    if (!ev.allowed) {
      throw new Error(ev.reason || 'Limite de colaboradores do plano excedido.');
    }
  }
  const errors: { rowNumber: number; errorMessage: string; data: ImportRow }[] = validatedRows
    .filter((r) => !r._valid)
    .map((r) => ({
      rowNumber: r._rowIndex,
      errorMessage: r._errors.join('; '),
      data: { ...r, _rowIndex: undefined, _valid: undefined, _errors: undefined } as ImportRow,
    }));

  let successCount = 0;

  for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
    const batch = toInsert.slice(i, i + BATCH_SIZE);
    for (const row of batch) {
      const mapped = mapImportFields(row, companyId);
      const payload = {
        id: crypto.randomUUID(),
        ...mapped,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      try {
        await db.insert('users', payload);
        successCount++;
      } catch (e: any) {
        errors.push({
          rowNumber: row._rowIndex,
          errorMessage: e?.message ?? 'Erro ao inserir',
          data: { ...row, _rowIndex: undefined, _valid: undefined, _errors: undefined } as ImportRow,
        });
      }
    }
  }

  const logPayload = {
    company_id: companyId,
    imported_by: importedBy,
    total_records: validatedRows.length,
    success_records: successCount,
    error_records: errors.length,
  };

  const logRows = await db.insert('employee_import_logs', logPayload);
  const logId = Array.isArray(logRows) && logRows[0] ? (logRows[0] as { id: string }).id : '';

  if (logId && errors.length > 0) {
    for (const err of errors) {
      try {
        await db.insert('employee_import_errors', {
          import_log_id: logId,
          row_number: err.rowNumber,
          error_message: err.errorMessage,
          data: err.data,
        });
      } catch {
        // não falhar o fluxo
      }
    }
  }

  return {
    logId,
    totalRecords: validatedRows.length,
    successRecords: successCount,
    errorRecords: errors.length,
    errors,
  };
}

/** Gera CSV dos erros para download. */
export function buildErrorsCsv(errors: { rowNumber: number; errorMessage: string; data: ImportRow }[]): string {
  const headers = ['Linha', 'Erro', ...TEMPLATE_HEADERS];
  const lines = errors.map((e) => {
    const row = e.data as Record<string, string | undefined>;
    const cells = [e.rowNumber, e.errorMessage, ...TEMPLATE_HEADERS.map((h) => (row[h] ?? '').toString().replace(/"/g, '""'))];
    return cells.map((c) => `"${c}"`).join(',');
  });
  return ['\ufeff' + headers.join(','), ...lines].join('\r\n');
}
