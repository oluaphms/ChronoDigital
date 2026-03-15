/**
 * Parser de arquivos para importação de funcionários (SmartPonto).
 * Suporta: CSV, TXT, XLSX, XLS, PDF, DOC, DOCX.
 * Converte qualquer formato para estrutura padronizada (nome, email, senha, cargo, etc.).
 */

import Papa from 'papaparse';
import * as XLSX from 'xlsx';

/** Linha bruta do arquivo (chaves podem variar conforme o formato). */
export interface RawImportRow {
  nome?: string;
  Nome?: string;
  nome_completo?: string;
  email?: string;
  senha?: string;
  cargo?: string;
  funcao?: string;
  telefone?: string;
  cpf?: string;
  departamento?: string;
  escala?: string;
  horario?: string;
  pis?: string;
  ctps?: string;
  empresa?: string;
  estrutura?: string;
  admissao?: string;
  observacoes?: string;
  numero_folha?: string;
  identificador?: string;
  assinatura_digital?: string;
  [key: string]: string | undefined;
}

/** Estrutura padronizada de um funcionário para importação. */
export interface NormalizedEmployeeRow {
  nome: string;
  email: string;
  senha: string;
  cargo: string;
  telefone: string;
  cpf: string;
  departamento: string;
  escala: string;
}

function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

/** Converte linha bruta para estrutura padronizada (aceita várias nomenclaturas de coluna). */
export function normalizarFuncionario(row: RawImportRow): NormalizedEmployeeRow {
  const get = (... keys: string[]) => {
    for (const k of keys) {
      const v = row[k];
      if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
    }
    return '';
  };
  const nome = get('nome', 'Nome', 'nome_completo') || 'Sem nome';
  const email = get('email').toLowerCase();
  const senha = get('senha') || '123456';
  const cargo = get('cargo', 'funcao') || 'Colaborador';
  const telefone = get('telefone');
  const cpf = get('cpf');
  const departamento = get('departamento');
  const escala = get('escala', 'horario');
  return {
    nome,
    email,
    senha,
    cargo,
    telefone,
    cpf,
    departamento,
    escala,
  };
}

/** Converte texto em linhas (PDF/Word) para array de objetos usando CSV ou formato label: valor. */
function converterLinhasParaFuncionarios(linhas: string[]): RawImportRow[] {
  const rows: RawImportRow[] = [];
  const lines = linhas.map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return rows;

  const first = lines[0].toLowerCase();
  const sep = first.includes(';') ? ';' : ',';
  const looksLikeCsv = /^(nome|name|email|cpf|cargo)/i.test(first) && (first.includes(sep) || first.includes(','));
  if (looksLikeCsv) {
    const header = lines[0].split(sep).map((c) => normalizeHeader(c.replace(/^"|"$/g, '')));
    for (let i = 1; i < lines.length; i++) {
      const parts: string[] = [];
      let cur = '';
      let inQuotes = false;
      const line = lines[i];
      for (let j = 0; j < line.length; j++) {
        const c = line[j];
        if (c === '"') inQuotes = !inQuotes;
        else if ((c === sep || c === ',') && !inQuotes) {
          parts.push(cur.trim().replace(/^"|"$/g, ''));
          cur = '';
        } else cur += c;
      }
      parts.push(cur.trim().replace(/^"|"$/g, ''));
      const obj: RawImportRow = {};
      header.forEach((h, idx) => {
        if (h) obj[h] = parts[idx] ?? '';
      });
      if (Object.keys(obj).length > 0) rows.push(obj);
    }
    return rows;
  }

  const re = /(\w[\w\s]*?)\s*[:=]\s*(.+)/g;
  let raw: Record<string, string> = {};
  for (const line of lines) {
    const m = re.exec(line);
    if (m) {
      const key = m[1].toLowerCase().replace(/\s+/g, ' ').trim();
      const val = m[2].trim();
      if (key === 'senha' || key === 'senha inicial') raw.senha = val;
      else if (key === 'nome') raw.nome = val;
      else if (key === 'email') raw.email = val;
      else if (key === 'cpf') raw.cpf = val;
      else if (key === 'telefone') raw.telefone = val;
      else if (key === 'função' || key === 'cargo') raw.cargo = val;
      else if (key === 'departamento') raw.departamento = val;
      else if (key === 'horário' || key === 'escala') raw.escala = val;
    } else {
      if (raw.nome || raw.email || raw.cpf) {
        rows.push({ ...raw } as RawImportRow);
        raw = {};
      }
    }
  }
  if (raw.nome || raw.email || raw.cpf) rows.push({ ...raw } as RawImportRow);
  return rows;
}

function parseCSV(file: File): Promise<RawImportRow[]> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      encoding: 'UTF-8',
      complete: (res) => {
        const rows = (res.data as Record<string, unknown>[]).map((r) => {
          const out: RawImportRow = {};
          Object.entries(r).forEach(([k, v]) => {
            const key = normalizeHeader(k) || k;
            out[key] = typeof v === 'string' ? v.trim() : String(v ?? '').trim();
          });
          return out;
        });
        resolve(rows);
      },
      error: (err) => reject(err),
    });
  });
}

/** Excel via SheetJS (xlsx) - evita erro "0 is out of bounds" do ExcelJS. */
function parseExcel(file: File): Promise<RawImportRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result as ArrayBuffer;
        if (!data || data.byteLength === 0) {
          resolve([]);
          return;
        }
        const wb = XLSX.read(new Uint8Array(data), { type: 'array', cellDates: false });
        const firstSheetName = wb.SheetNames[0];
        if (!firstSheetName) {
          resolve([]);
          return;
        }
        const sheet = wb.Sheets[firstSheetName];
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
        const rows: RawImportRow[] = json.map((r) => {
          const out: RawImportRow = {};
          Object.entries(r).forEach(([k, v]) => {
            const key = normalizeHeader(String(k));
            if (key) out[key] = typeof v === 'string' ? v.trim() : String(v ?? '').trim();
          });
          return out;
        });
        resolve(rows);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Falha ao ler arquivo'));
    reader.readAsArrayBuffer(file);
  });
}

async function parsePDF(file: File): Promise<RawImportRow[]> {
  try {
    const buffer = await file.arrayBuffer();
    const pdfjsLib = await import('pdfjs-dist');
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
    const numPages = pdf.numPages;
    let fullText = '';
    for (let p = 1; p <= numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      const items = (content.items as { str?: string; transform?: number[] }[]) || [];
      let lastY: number | null = null;
      const lineHeight = 12;
      for (const it of items) {
        const y = it.transform?.[5] ?? 0;
        if (lastY !== null && Math.abs(y - lastY) > lineHeight) fullText += '\n';
        lastY = y;
        fullText += (it.str || '') + ' ';
      }
      fullText += '\n';
    }
    const linhas = fullText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    return converterLinhasParaFuncionarios(linhas);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'PDF não pôde ser lido';
    throw new Error(`PDF: ${msg}. Tente CSV ou Excel.`);
  }
}

async function parseWord(file: File): Promise<RawImportRow[]> {
  try {
    const mammoth = await import('mammoth');
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    const text = result.value || '';
    const linhas = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    return converterLinhasParaFuncionarios(linhas);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Documento não pôde ser lido';
    throw new Error(`Word: ${msg}. Tente CSV ou Excel.`);
  }
}

/**
 * Detecta o tipo do arquivo e retorna linhas brutas (objetos com chaves normalizadas).
 * Suporta: csv, txt, xlsx, xls, pdf, doc, docx.
 */
export async function parseEmployeesFile(file: File): Promise<RawImportRow[]> {
  const extension = (file.name.split('.').pop() || '').toLowerCase();
  const mime = (file.type || '').toLowerCase();

  if (extension === 'csv' || extension === 'txt' || mime.includes('text/plain') || mime.includes('text/csv') || mime.includes('application/csv')) {
    return parseCSV(file);
  }
  if (extension === 'xlsx' || extension === 'xls' || mime.includes('spreadsheet') || mime.includes('excel')) {
    return parseExcel(file);
  }
  if (extension === 'pdf' || mime.includes('pdf')) {
    return parsePDF(file);
  }
  if (extension === 'docx' || extension === 'doc' || mime.includes('wordprocessingml') || mime.includes('msword')) {
    return parseWord(file);
  }

  throw new Error('Formato de arquivo não suportado. Use CSV, TXT, XLSX, PDF ou DOC/DOCX.');
}

/**
 * Parse do arquivo e normalização em uma única chamada.
 * Retorna lista padronizada para inserção (com senha default 123456 se vazio).
 */
export async function parseAndNormalizeEmployeesFile(file: File): Promise<NormalizedEmployeeRow[]> {
  const raw = await parseEmployeesFile(file);
  return raw.map(normalizarFuncionario).filter((r) => r.nome !== 'Sem nome' || r.email || r.cpf);
}
