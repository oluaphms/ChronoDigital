import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserPlus, Pencil, UserX, Trash2, Eye, EyeOff, UserCheck, Search, Upload, FileDown, X } from 'lucide-react';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import PageHeader from '../../components/PageHeader';
import { db, auth, isSupabaseConfigured } from '../../services/supabaseClient';
import { LoadingState } from '../../../components/UI';
import RoleGuard from '../../components/auth/RoleGuard';

interface EmployeeRow {
  id: string;
  nome: string;
  cpf?: string;
  email: string;
  phone?: string;
  cargo: string;
  department_id?: string;
  department_name?: string;
  schedule_id?: string;
  schedule_name?: string;
  status: string;
  created_at: string;
}

interface ScheduleOption {
  id: string;
  name: string;
}

const OUTRO_CARGO_VALUE = '__outro__';

/** Linha do CSV de importação (colunas: nome, email, senha, cargo, telefone, cpf, departamento, escala) */
interface ImportRow {
  nome: string;
  email: string;
  senha: string;
  cargo: string;
  telefone: string;
  cpf: string;
  departamento: string;
  escala: string;
}

interface ImportResult {
  success: number;
  failed: { row: number; email: string; reason: string }[];
}

const CSV_TEMPLATE = 'nome,email,senha,cargo,telefone,cpf,departamento,escala\n"Maria Silva",maria@empresa.com,senha123,Analista,(11) 99999-0000,12345678901,,\n"João Santos",joao@empresa.com,senha123,Desenvolvedor,,,,';

const AdminEmployees: React.FC = () => {
  const { user, loading } = useCurrentUser();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<EmployeeRow[]>([]);
  const [schedules, setSchedules] = useState<ScheduleOption[]>([]);
  const [cargos, setCargos] = useState<{ id: string; name: string }[]>([]);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    nome: '',
    cpf: '',
    email: '',
    password: '',
    phone: '',
    cargo: '',
    cargoOutro: '',
    department_id: '',
    schedule_id: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const loadData = async () => {
    if (!user?.companyId || !isSupabaseConfigured) return;
    setLoadingData(true);
    try {
      const [usersRows, schedRows, deptRows, jobTitlesRows] = await Promise.all([
        db.select('users', [{ column: 'company_id', operator: 'eq', value: user.companyId }], { column: 'created_at', ascending: false }) as Promise<any[]>,
        db.select('schedules', [{ column: 'company_id', operator: 'eq', value: user.companyId }]) as Promise<any[]>,
        db.select('departments', [{ column: 'company_id', operator: 'eq', value: user.companyId }]) as Promise<any[]>,
        db.select('job_titles', [{ column: 'company_id', operator: 'eq', value: user.companyId }]) as Promise<any[]>,
      ]);
      const deptMap = new Map((deptRows ?? []).map((d: any) => [d.id, d.name]));
      const schedMap = new Map((schedRows ?? []).map((s: any) => [s.id, s.name]));
      const list = (usersRows ?? []).map((u: any) => ({
        id: u.id,
        nome: u.nome || '',
        cpf: u.cpf,
        email: u.email || '',
        phone: u.phone,
        cargo: u.cargo || 'Colaborador',
        department_id: u.department_id,
        department_name: u.department_id ? deptMap.get(u.department_id) : undefined,
        schedule_id: u.schedule_id,
        schedule_name: u.schedule_id ? schedMap.get(u.schedule_id) : undefined,
        status: u.status || 'active',
        created_at: u.created_at,
      }));
      setRows(list);
      setSchedules((schedRows ?? []).map((s: any) => ({ id: s.id, name: s.name })));
      setDepartments((deptRows ?? []).map((d: any) => ({ id: d.id, name: d.name })));
      setCargos((jobTitlesRows ?? []).map((j: any) => ({ id: j.id, name: j.name || '' })));
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user?.companyId]);

  const openCreate = () => {
    setEditingId(null);
    const firstCargo = cargos[0]?.name || '';
    setForm({ nome: '', cpf: '', email: '', password: '', phone: '', cargo: firstCargo || OUTRO_CARGO_VALUE, cargoOutro: '', department_id: '', schedule_id: '' });
    setModalOpen(true);
    setError(null);
    setSuccess(null);
  };

  const openEdit = (row: EmployeeRow) => {
    setEditingId(row.id);
    const cargoCadastrado = cargos.some((c) => c.name === row.cargo);
    setForm({
      nome: row.nome,
      cpf: row.cpf || '',
      email: row.email,
      password: '',
      phone: row.phone || '',
      cargo: cargoCadastrado ? row.cargo : OUTRO_CARGO_VALUE,
      cargoOutro: cargoCadastrado ? '' : row.cargo,
      department_id: row.department_id || '',
      schedule_id: row.schedule_id || '',
    });
    setModalOpen(true);
    setError(null);
    setSuccess(null);
  };

  const handleSave = async () => {
    if (!user?.companyId || !isSupabaseConfigured) return;
    if (!form.nome.trim()) {
      setError('Informe o nome.');
      return;
    }
    if (!editingId && !form.email.trim()) {
      setError('Informe o e-mail.');
      return;
    }
    if (!editingId && !form.password.trim()) {
      setError('Informe a senha inicial para o funcionário.');
      return;
    }
    const cargoFinal = form.cargo === OUTRO_CARGO_VALUE ? (form.cargoOutro.trim() || 'Colaborador') : form.cargo;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      if (editingId) {
        await db.update('users', editingId, {
          nome: form.nome.trim(),
          cpf: form.cpf || null,
          phone: form.phone || null,
          cargo: cargoFinal,
          department_id: form.department_id || null,
          schedule_id: form.schedule_id || null,
        });
        setSuccess('Funcionário atualizado com sucesso.');
        setModalOpen(false);
        loadData();
      } else {
        const email = form.email.trim().toLowerCase();
        const authData = await auth.signUp(email, form.password, { nome: form.nome, cargo: cargoFinal });
        if (!authData?.user?.id) throw new Error('Conta criada mas ID não retornado.');
        await db.insert('users', {
          id: authData.user.id,
          nome: form.nome.trim(),
          cpf: form.cpf || null,
          email,
          phone: form.phone || null,
          cargo: cargoFinal,
          role: 'employee',
          company_id: user.companyId,
          department_id: form.department_id || null,
          schedule_id: form.schedule_id || null,
          status: 'active',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        setSuccess('Funcionário cadastrado. Ele pode acessar com o e-mail e a senha informados.');
        setModalOpen(false);
        setForm({ ...form, password: '' });
        loadData();
      }
    } catch (e: any) {
      const msg = String(e?.message ?? '');
      const code = e?.code ?? '';
      const isDuplicateEmail =
        code === '23505' ||
        msg.includes('users_email_key') ||
        (msg.includes('duplicate key') && msg.includes('email')) ||
        /already registered|already exists|user already/i.test(msg);
      if (isDuplicateEmail) {
        setError('Este e-mail já está cadastrado. Use outro e-mail ou edite o funcionário existente.');
      } else {
        setError(msg || 'Erro ao salvar');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (id: string) => {
    if (!confirm('Desativar este funcionário?')) return;
    try {
      await db.update('users', id, { status: 'inactive', updated_at: new Date().toISOString() });
      setSuccess('Funcionário desativado.');
      loadData();
    } catch (e: any) {
      setError(e?.message || 'Erro ao desativar');
    }
  };

  const handleReactivate = async (id: string) => {
    try {
      await db.update('users', id, { status: 'active', updated_at: new Date().toISOString() });
      setSuccess('Funcionário reativado.');
      loadData();
    } catch (e: any) {
      setError(e?.message || 'Erro ao reativar');
    }
  };

  const searchLower = search.trim().toLowerCase();
  const filteredRows = searchLower
    ? rows.filter(
        (r) =>
          r.nome.toLowerCase().includes(searchLower) ||
          (r.email && r.email.toLowerCase().includes(searchLower)) ||
          (r.cpf && r.cpf.replace(/\D/g, '').includes(searchLower))
      )
    : rows;

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este funcionário? Esta ação não pode ser desfeita.')) return;
    try {
      await db.delete('users', id);
      setSuccess('Funcionário excluído.');
      loadData();
    } catch (e: any) {
      setError(e?.message || 'Erro ao excluir');
    }
  };

  /** Parse CSV simples: suporta vírgula ou ponto-e-vírgula; campos entre aspas opcional. */
  const parseCSV = (text: string): ImportRow[] => {
    const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return [];
    const header = lines[0].toLowerCase();
    const sep = header.includes(';') ? ';' : ',';
    const rows: ImportRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const parts: string[] = [];
      let cur = '';
      let inQuotes = false;
      for (let j = 0; j < line.length; j++) {
        const c = line[j];
        if (c === '"') {
          inQuotes = !inQuotes;
        } else if ((c === sep && !inQuotes) || (c === '\t' && !inQuotes)) {
          parts.push(cur.trim());
          cur = '';
        } else {
          cur += c;
        }
      }
      parts.push(cur.trim());
      const nome = parts[0]?.replace(/^"|"$/g, '')?.trim() || '';
      const email = (parts[1]?.replace(/^"|"$/g, '')?.trim() || '').toLowerCase();
      const senha = parts[2]?.replace(/^"|"$/g, '')?.trim() || '';
      const cargo = parts[3]?.replace(/^"|"$/g, '')?.trim() || 'Colaborador';
      const telefone = parts[4]?.replace(/^"|"$/g, '')?.trim() || '';
      const cpf = parts[5]?.replace(/^"|"$/g, '')?.trim() || '';
      const departamento = parts[6]?.replace(/^"|"$/g, '')?.trim() || '';
      const escala = parts[7]?.replace(/^"|"$/g, '')?.trim() || '';
      if (nome || email) {
        rows.push({ nome, email, senha, cargo, telefone, cpf, departamento, escala });
      }
    }
    return rows;
  };

  const handleDownloadTemplate = () => {
    const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'modelo_importacao_funcionarios.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  /** Converte arquivo em lista de ImportRow conforme o tipo (CSV, TXT, XLSX, PDF). */
  const parseFileToImportRows = async (file: File): Promise<{ rows: ImportRow[]; error?: string }> => {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const mime = (file.type || '').toLowerCase();

    // CSV ou TXT: texto
    if (ext === 'csv' || ext === 'txt' || mime.includes('text/plain') || mime.includes('text/csv') || mime.includes('application/csv')) {
      const text = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve((r.result as string) || '');
        r.onerror = () => reject(new Error('Falha ao ler arquivo'));
        r.readAsText(file, 'UTF-8');
      });
      const rows = parseCSV(text);
      return { rows };
    }

    // Excel (XLSX / XLS)
    if (ext === 'xlsx' || ext === 'xls' || mime.includes('spreadsheet') || mime.includes('excel')) {
      const buffer = await file.arrayBuffer();
      const ExcelJS = (await import('exceljs')).default;
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);
      const sheet = workbook.worksheets[0];
      if (!sheet) return { rows: [], error: 'Planilha vazia' };
      const headerRow = sheet.getRow(1);
      const col = (key: string) => {
        const k = key.toLowerCase();
        let idx = 0;
        headerRow.eachCell((cell, colNumber) => {
          if (String(cell.value || '').toLowerCase().trim() === k) idx = colNumber;
        });
        return idx;
      };
      const get = (row: any, key: string) => String(row.getCell(col(key))?.value ?? '').trim();
      const rows: ImportRow[] = [];
      for (let i = 2; i <= sheet.rowCount; i++) {
        const row = sheet.getRow(i);
        const nome = get(row, 'nome');
        const email = get(row, 'email');
        if (!nome && !email) continue;
        rows.push({
          nome,
          email: email.toLowerCase(),
          senha: get(row, 'senha'),
          cargo: get(row, 'cargo') || 'Colaborador',
          telefone: get(row, 'telefone'),
          cpf: get(row, 'cpf'),
          departamento: get(row, 'departamento'),
          escala: get(row, 'escala'),
        });
      }
      return { rows };
    }

    // PDF: extrair texto e interpretar como linhas CSV-like
    if (ext === 'pdf' || mime.includes('pdf')) {
      try {
        const buffer = await file.arrayBuffer();
        const pdfjsLib = await import('pdfjs-dist');
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
        const numPages = pdf.numPages;
        let fullText = '';
        for (let p = 1; p <= numPages; p++) {
          const page = await pdf.getPage(p);
          const content = await page.getTextContent();
          fullText += (content.items as { str?: string }[]).map((it) => it.str || '').join(' ') + '\n';
        }
        const rows = parseCSV(fullText);
        return { rows };
      } catch (err: any) {
        return { rows: [], error: `PDF não pôde ser lido: ${err?.message || 'formato inválido'}. Use CSV ou Excel.` };
      }
    }

    // Outros: tentar como texto
    const text = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve((r.result as string) || '');
      r.onerror = () => reject(new Error('Falha ao ler arquivo'));
      r.readAsText(file, 'UTF-8');
    });
    const rows = parseCSV(text);
    return { rows };
  };

  const runBulkImport = async (toImport: ImportRow[]) => {
    if (!user?.companyId) return;
    const failed: ImportResult['failed'] = [];
    let success = 0;
    const deptByName = new Map(departments.map((d) => [d.name.trim().toLowerCase(), d.id]));
    const schedByName = new Map(schedules.map((s) => [s.name.trim().toLowerCase(), s.id]));
    for (let i = 0; i < toImport.length; i++) {
      const row = toImport[i];
      const rowNum = i + 2;
      if (!row.nome.trim()) {
        failed.push({ row: rowNum, email: row.email || '—', reason: 'Nome obrigatório' });
        continue;
      }
      if (!row.email.trim()) {
        failed.push({ row: rowNum, email: '—', reason: 'E-mail obrigatório' });
        continue;
      }
      const senha = row.senha.trim() || `Smart${Date.now().toString(36)}!`;
      const cargoFinal = row.cargo || 'Colaborador';
      const departmentId = row.departamento ? deptByName.get(row.departamento.trim().toLowerCase()) || '' : '';
      const scheduleId = row.escala ? schedByName.get(row.escala.trim().toLowerCase()) || '' : '';
      try {
        const authData = await auth.signUp(row.email.trim().toLowerCase(), senha, { nome: row.nome, cargo: cargoFinal });
        if (!authData?.user?.id) {
          failed.push({ row: rowNum, email: row.email, reason: 'Conta criada mas ID não retornado' });
          continue;
        }
        await db.insert('users', {
          id: authData.user.id,
          nome: row.nome.trim(),
          cpf: row.cpf || null,
          email: row.email.trim().toLowerCase(),
          phone: row.telefone || null,
          cargo: cargoFinal,
          role: 'employee',
          company_id: user.companyId,
          department_id: departmentId || null,
          schedule_id: scheduleId || null,
          status: 'active',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        success++;
      } catch (err: any) {
        const msg = String(err?.message ?? '');
        const code = err?.code ?? '';
        const isDup = code === '23505' || msg.includes('duplicate') || /already registered|already exists|user already/i.test(msg);
        failed.push({
          row: rowNum,
          email: row.email,
          reason: isDup ? 'E-mail já cadastrado' : (msg || 'Erro ao criar'),
        });
      }
    }
    setImportResult({ success, failed });
    if (success > 0) loadData();
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.companyId || !isSupabaseConfigured) return;
    setImportResult(null);
    setImporting(true);
    setError(null);
    setSuccess(null);
    try {
      const { rows: toImport, error: parseError } = await parseFileToImportRows(file);
      if (parseError) {
        setError(parseError);
        setImporting(false);
        e.target.value = '';
        return;
      }
      if (toImport.length === 0) {
        setError('Nenhuma linha válida no arquivo. Use o modelo (nome, email, senha, cargo, telefone, cpf). Formatos: CSV, TXT, Excel (XLSX) ou PDF.');
        setImporting(false);
        e.target.value = '';
        return;
      }
      await runBulkImport(toImport);
    } catch (err: any) {
      setError(err?.message || 'Erro ao processar arquivo.');
    } finally {
      e.target.value = '';
      setImporting(false);
    }
  };

  const openImportModal = () => {
    setImportModalOpen(true);
    setImportResult(null);
    setError(null);
    setSuccess(null);
  };

  if (loading || !user) return <LoadingState message="Carregando..." />;

  return (
    <RoleGuard user={user} allowedRoles={['admin', 'hr']}>
      <div className="space-y-6">
        {success && (
          <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-sm">
            {success}
          </div>
        )}
        {error && !modalOpen && (
          <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
            {error}
          </div>
        )}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <PageHeader title="Funcionários" />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={openImportModal}
              className="inline-flex items-center gap-2 px-4 py-2.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              <Upload className="w-5 h-5" /> Importar funcionário
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors"
            >
              <UserPlus className="w-5 h-5" /> Cadastrar Funcionário
            </button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome, e-mail ou CPF..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 text-sm"
            />
          </div>
          {search && (
            <span className="text-sm text-slate-500 dark:text-slate-400 self-center">
              {filteredRows.length} de {rows.length} resultado(s)
            </span>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 overflow-hidden">
          {loadingData ? (
            <div className="p-12 text-center text-slate-500">Carregando...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                    <th className="text-left px-4 py-3 font-bold text-slate-500 dark:text-slate-400">Nome</th>
                    <th className="text-left px-4 py-3 font-bold text-slate-500 dark:text-slate-400">CPF</th>
                    <th className="text-left px-4 py-3 font-bold text-slate-500 dark:text-slate-400">Cargo</th>
                    <th className="text-left px-4 py-3 font-bold text-slate-500 dark:text-slate-400">Departamento</th>
                    <th className="text-left px-4 py-3 font-bold text-slate-500 dark:text-slate-400">Escala</th>
                    <th className="text-left px-4 py-3 font-bold text-slate-500 dark:text-slate-400">Status</th>
                    <th className="text-right px-4 py-3 font-bold text-slate-500 dark:text-slate-400">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr key={row.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                      <td className="px-4 py-3 text-slate-900 dark:text-white font-medium">{row.nome}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{row.cpf || '—'}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{row.cargo}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{row.department_name || '—'}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{row.schedule_name || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-lg text-xs font-medium ${row.status === 'active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}>
                          {row.status === 'active' ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button type="button" onClick={() => navigate('/admin/timesheet?user=' + row.id)} className="p-2 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg" title="Ver Espelho"><Eye className="w-4 h-4" /></button>
                          <button type="button" onClick={() => openEdit(row)} className="p-2 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg" title="Editar"><Pencil className="w-4 h-4" /></button>
                          {row.status === 'active' ? (
                            <button type="button" onClick={() => handleDeactivate(row.id)} className="p-2 text-slate-500 hover:text-amber-600 rounded-lg" title="Desativar"><UserX className="w-4 h-4" /></button>
                          ) : (
                            <button type="button" onClick={() => handleReactivate(row.id)} className="p-2 text-slate-500 hover:text-emerald-600 rounded-lg" title="Reativar"><UserCheck className="w-4 h-4" /></button>
                          )}
                          <button type="button" onClick={() => handleDelete(row.id)} className="p-2 text-slate-500 hover:text-red-600 rounded-lg" title="Excluir"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length === 0 && (
                <p className="p-8 text-center text-slate-500 dark:text-slate-400">Nenhum funcionário cadastrado.</p>
              )}
              {rows.length > 0 && filteredRows.length === 0 && (
                <p className="p-8 text-center text-slate-500 dark:text-slate-400">Nenhum resultado para &quot;{search}&quot;.</p>
              )}
            </div>
          )}
        </div>

        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onClick={() => !saving && setModalOpen(false)}>
            <div
              className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 w-full max-w-md max-h-[90vh] overflow-y-auto p-6 space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">{editingId ? 'Editar Funcionário' : 'Cadastrar Funcionário'}</h3>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="grid grid-cols-1 gap-3">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Nome</label>
                <input type="text" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white" placeholder="Nome completo" />
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">CPF</label>
                <input type="text" value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white" placeholder="CPF" />
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Email</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white" placeholder="email@empresa.com" disabled={!!editingId} />
                {!editingId && (
                  <>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Senha inicial</label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={form.password}
                        onChange={(e) => setForm({ ...form, password: e.target.value })}
                        className="w-full pl-3 pr-10 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                        placeholder="Senha para primeiro acesso"
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center px-1.5 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                        aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </>
                )}
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Telefone</label>
                <input type="text" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white" placeholder="Telefone" />
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Cargo</label>
                <select value={form.cargo} onChange={(e) => setForm({ ...form, cargo: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white">
                  {cargos.length === 0 && <option disabled>Nenhum cargo cadastrado. Cadastre em Cargos no menu.</option>}
                  {cargos.map((c) => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
                  <option value={OUTRO_CARGO_VALUE}>Outro (especificar)</option>
                </select>
                {form.cargo === OUTRO_CARGO_VALUE && (
                  <>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Especificar cargo</label>
                    <input type="text" value={form.cargoOutro} onChange={(e) => setForm({ ...form, cargoOutro: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white" placeholder="Ex: Analista de Suporte" />
                  </>
                )}
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Departamento</label>
                <select value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white">
                  <option value="">Nenhum</option>
                  {departments.length === 0 && <option disabled>Nenhum departamento. Cadastre em Departamentos no menu.</option>}
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Escala</label>
                <select value={form.schedule_id} onChange={(e) => setForm({ ...form, schedule_id: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white">
                  <option value="">Nenhuma</option>
                  {schedules.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setModalOpen(false)} className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium">Cancelar</button>
                <button type="button" onClick={handleSave} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-50">Salvar</button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Importar funcionário */}
        {importModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onClick={() => !importing && setImportModalOpen(false)}>
            <div
              className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Importar funcionário(s)</h3>
                <button type="button" onClick={() => !importing && setImportModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Envie um arquivo com as colunas: <strong>nome</strong>, <strong>email</strong>, <strong>senha</strong>, cargo, telefone, cpf, departamento, escala. Aceitos: <strong>CSV</strong>, <strong>TXT</strong>, <strong>Excel (XLSX)</strong>, <strong>PDF</strong> e demais formatos de texto. A primeira linha deve ser o cabeçalho.
              </p>
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <FileDown className="w-4 h-4" /> Baixar modelo CSV
              </button>
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.txt,.pdf,.xlsx,.xls,text/csv,text/plain,application/csv,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,*/*"
                  onChange={handleImportFile}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importing}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-50"
                >
                  <Upload className="w-5 h-5" />
                  {importing ? 'Importando...' : 'Selecionar arquivo (CSV, TXT, PDF, Excel…)'}
                </button>
              </div>
              {importResult && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-2">
                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                    {importResult.success} importado(s) com sucesso.
                    {importResult.failed.length > 0 && ` ${importResult.failed.length} falha(s).`}
                  </p>
                  {importResult.failed.length > 0 && (
                    <ul className="text-xs text-slate-600 dark:text-slate-400 space-y-1 max-h-40 overflow-y-auto">
                      {importResult.failed.map((f, i) => (
                        <li key={i}>
                          Linha {f.row} ({f.email}): {f.reason}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              <div className="flex justify-end pt-2">
                <button type="button" onClick={() => setImportModalOpen(false)} className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-50 dark:hover:bg-slate-800">
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </RoleGuard>
  );
};

export default AdminEmployees;
