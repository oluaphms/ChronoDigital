import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { isSupabaseConfigured, supabase } from '../../services/supabaseClient';
import { buscarEspelhoAdmin, buscarFiltrosEspelhoAdmin } from '../../../services/api';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import { useToast } from '../../components/ToastProvider';
import PageHeader from '../../components/PageHeader';
import { LoadingState, Button } from '../../../components/UI';
import { FileDown, FileSpreadsheet, Lock, Plus, RefreshCw, Upload } from 'lucide-react';
import { AddTimeRecordModal } from '../../components/AddTimeRecordModal';
import { EditTimeRecordModal } from '../../components/EditTimeRecordModal';
import { SkeletonFiltro, TimesheetTableSkeleton } from '../../components/TimesheetTableSkeleton';
import {
  buildDayMirrorSummary,
  DayMirror,
  isManualRecord,
  isRepMirrorRecord,
  isStatusRecord,
  formatMinutes,
  getDayStatus,
  normalizeRecordTypeForMirror,
  recordEffectiveMirrorInstant,
} from '../../utils/timesheetMirror';
import { getEmployeeSchedule, getEmployeeTimesheetScheduleContext } from '../../services/timeProcessingService';
import type { DayScheduleWindow } from '../../utils/timesheetMirror';
import { closeTimesheet, isTimesheetClosed } from '../../services/timeProcessingService';
import {
  invalidateAfterPunch,
  invalidateAfterTimesheetMonthClose,
  invalidateCompanyListCaches,
} from '../../services/queryCache';
import { enumerateLocalCalendarDays } from '../../utils/localDateTimeToIso';
import { sameUserId } from '../../utils/userIdMatch';
import { resolvePunchOrigin } from '../../utils/punchOrigin';

/** Filtros do espelho por utilizador — sobrevivem a novo login na mesma aba/navegador. */
function adminTimesheetFiltersKey(userId: string) {
  return `pontowebdesk:admin-timesheet-filters:${userId}`;
}

/** Data local YYYY-MM-DD (evita UTC deslocar o “hoje” no max do input). */
function localDateKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

type AdminEmployee = { id: string; nome: string; department_id?: string; role?: string };

/** Célula sem batida (pedido de UX). */
const EMPTY_DASH = '----';

type TimeRecord = {
  id: string;
  user_id: string;
  created_at: string;
  timestamp?: string | null;
  type: 'entrada' | 'saida' | 'intervalo_saida' | 'intervalo_volta';
  manual_reason?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  is_manual?: boolean;
  source?: string | null;
  method?: string | null;
  origin?: string | null;
};

const AdminTimesheet: React.FC = () => {
  const { user, loading } = useCurrentUser();
  const toast = useToast();

  const [employees, setEmployees] = useState<AdminEmployee[]>([]);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [records, setRecords] = useState<TimeRecord[]>([]);
  const [holidays, setHolidays] = useState<{ id: string; date: string; name: string }[]>([]);
  const [loadingEspelho, setLoadingEspelho] = useState(false);
  const [loadingFiltros, setLoadingFiltros] = useState(false);
  const [scheduleWorkDays, setScheduleWorkDays] = useState<number[] | null>(null);
  const [scheduleWindowsByDow, setScheduleWindowsByDow] = useState<Record<number, DayScheduleWindow | null> | null>(
    null,
  );

  const [filterUserId, setFilterUserId] = useState('');
  const [filterDepartmentId, setFilterDepartmentId] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [recordTypeFilter, setRecordTypeFilter] = useState<'all' | 'manual' | 'normal'>('all');
  const todayMax = useMemo(() => localDateKey(), []);

  const periodValid =
    Boolean(periodStart && periodEnd && periodStart <= periodEnd && periodEnd <= todayMax && periodStart <= todayMax);

  const companyId = user?.companyId || user?.company_id;

  const [closingMonth, setClosingMonth] = useState(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
  });
  const [closingLoading, setClosingLoading] = useState(false);

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [recordToEdit, setRecordToEdit] = useState<TimeRecord | null>(null);

  /** Evita `loadEspelho` com período vazio antes de ler sessionStorage (caso típico: novo login → batidas “sumiam”). */
  const [filtersHydrated, setFiltersHydrated] = useState(false);

  const holidayDates = useMemo(() => new Set(holidays.map((h) => h.date).filter(Boolean)), [holidays]);

  const expectedWindowForYmd = useCallback(
    (dateStr: string): DayScheduleWindow | null | undefined => {
      if (!scheduleWindowsByDow) return undefined;
      const dow = new Date(`${dateStr}T12:00:00`).getDay();
      return scheduleWindowsByDow[dow];
    },
    [scheduleWindowsByDow],
  );

  useEffect(() => {
    if (!filterUserId || !companyId || !isSupabaseConfigured()) {
      setScheduleWorkDays(null);
      setScheduleWindowsByDow(null);
      return;
    }
    let active = true;
    (async () => {
      const [schedule, ctx] = await Promise.all([
        getEmployeeSchedule(filterUserId, companyId),
        getEmployeeTimesheetScheduleContext(filterUserId, companyId),
      ]);
      if (active) {
        setScheduleWorkDays(ctx.workDays?.length ? ctx.workDays : schedule?.work_days ?? null);
        setScheduleWindowsByDow(ctx.windowByJsDow);
      }
    })();
    return () => {
      active = false;
    };
  }, [filterUserId, companyId]);

  /** Catálogo (colaboradores + departamentos) — não depende do período; evita selects vazios. */
  const loadFiltrosEspelho = useCallback(async () => {
    if (!companyId || !isSupabaseConfigured()) return;
    setLoadingFiltros(true);
    try {
      const f = await buscarFiltrosEspelhoAdmin(companyId);
      setEmployees(f.employees);
      setDepartments(f.departments);
    } catch (e) {
      console.error(e);
      toast.addToast('error', 'Não foi possível carregar colaboradores e departamentos.');
    } finally {
      setLoadingFiltros(false);
    }
  }, [companyId, toast]);

  useEffect(() => {
    void loadFiltrosEspelho();
  }, [loadFiltrosEspelho]);

  /** Restaura período/colaborador após sair e voltar ao sistema (estado React começa vazio). */
  useEffect(() => {
    if (!user?.id) {
      setFiltersHydrated(false);
      return;
    }
    try {
      const raw = sessionStorage.getItem(adminTimesheetFiltersKey(user.id));
      if (raw) {
        const s = JSON.parse(raw) as {
          periodStart?: string;
          periodEnd?: string;
          filterUserId?: string;
          filterDepartmentId?: string;
        };
        if (typeof s.periodStart === 'string' && s.periodStart) setPeriodStart(s.periodStart);
        if (typeof s.periodEnd === 'string' && s.periodEnd) setPeriodEnd(s.periodEnd);
        if (typeof s.filterUserId === 'string') setFilterUserId(s.filterUserId);
        if (typeof s.filterDepartmentId === 'string') setFilterDepartmentId(s.filterDepartmentId);
      }
    } catch {
      /* ignore */
    }
    setFiltersHydrated(true);
  }, [user?.id]);

  /** Persiste filtros para o próximo acesso. */
  useEffect(() => {
    if (!user?.id || !filtersHydrated) return;
    try {
      sessionStorage.setItem(
        adminTimesheetFiltersKey(user.id),
        JSON.stringify({
          periodStart,
          periodEnd,
          filterUserId,
          filterDepartmentId,
        }),
      );
    } catch {
      /* quota / privado */
    }
  }, [user?.id, filtersHydrated, periodStart, periodEnd, filterUserId, filterDepartmentId]);

  const loadEspelho = useCallback(async () => {
    if (!companyId || !isSupabaseConfigured()) {
      setLoadingEspelho(false);
      return;
    }
    if (!periodValid) {
      setRecords([]);
      setHolidays([]);
      setLoadingEspelho(false);
      return;
    }
    setLoadingEspelho(true);
    try {
      const data = await buscarEspelhoAdmin(companyId, periodStart, periodEnd);
      setEmployees(data.employees ?? []);
      setDepartments(data.departments ?? []);
      setRecords((data.records ?? []) as TimeRecord[]);
      setHolidays(data.holidays ?? []);
    } catch (e) {
      console.error(e);
      toast.addToast('error', 'Não foi possível carregar o espelho de ponto.');
    } finally {
      setLoadingEspelho(false);
    }
  }, [companyId, periodStart, periodEnd, periodValid, toast]);

  useEffect(() => {
    if (!filtersHydrated) return;
    void loadEspelho();
  }, [loadEspelho, filtersHydrated]);

  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      if (filterDepartmentId && emp.department_id !== filterDepartmentId) return false;
      return true;
    });
  }, [employees, filterDepartmentId]);

  const displayRecords = useMemo(() => {
    if (!filterUserId) return [];
    const byUser = records.filter((r) => sameUserId(r.user_id, filterUserId));
    if (recordTypeFilter === 'all') return byUser;
    if (recordTypeFilter === 'manual') return byUser.filter((r) => isManualRecord(r));
    return byUser.filter((r) => !isManualRecord(r));
  }, [records, filterUserId, recordTypeFilter]);

  const empMirror = useMemo(() => {
    if (!periodValid) return new Map<string, DayMirror>();
    return buildDayMirrorSummary(displayRecords, periodStart, periodEnd);
  }, [displayRecords, periodStart, periodEnd, periodValid]);

  const periodDates = useMemo(() => {
    if (!periodValid) return [];
    return enumerateLocalCalendarDays(periodStart, periodEnd);
  }, [periodStart, periodEnd, periodValid]);

  const formatDateBR = (dateStr: string) => {
    const [y, m, day] = dateStr.split('-');
    return `${day}/${m}/${y}`;
  };

  const handleAddRecord = async (data: {
    user_id: string;
    created_at: string;
    type: string;
    manual_reason?: string;
    latitude?: number;
    longitude?: number;
  }) => {
    const cid = String(companyId ?? '').trim();
    if (!cid) return;

    const buildMergeRow = (id: string, createdIso: string): TimeRecord => ({
      id,
      user_id: data.user_id,
      created_at: createdIso,
      type: data.type as TimeRecord['type'],
      manual_reason: data.manual_reason,
      latitude: data.latitude,
      longitude: data.longitude,
      is_manual: true,
    });

    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc('insert_time_record_for_user', {
        p_user_id: data.user_id,
        p_company_id: cid,
        p_type: data.type,
        p_method: 'admin',
        p_source: 'admin',
        p_timestamp: data.created_at,
        p_latitude: data.latitude ?? null,
        p_longitude: data.longitude ?? null,
        p_manual_reason: data.manual_reason ?? null,
      });

      let mergeRow: TimeRecord | null = null;
      let mergeId: string | null = null;

      if (!rpcError && rpcData && typeof rpcData === 'object' && rpcData !== null && 'record_id' in rpcData) {
        const r = rpcData as { record_id: string; timestamp?: string | number | null };
        mergeId = String(r.record_id);
        let createdIso = data.created_at;
        if (typeof r.timestamp === 'string') {
          createdIso = r.timestamp;
        } else if (r.timestamp != null && (typeof r.timestamp === 'number' || typeof r.timestamp === 'object')) {
          createdIso = new Date(r.timestamp as number | Date).toISOString();
        }
        mergeRow = buildMergeRow(mergeId, createdIso);
      } else {
        if (rpcError && import.meta.env.DEV) {
          console.warn('[Espelho admin] insert_time_record_for_user:', rpcError);
        }
        mergeId = crypto.randomUUID();
        const { error: insErr } = await supabase.from('time_records').insert({
          ...data,
          id: mergeId,
          company_id: cid,
          is_manual: true,
          method: 'admin',
        });
        if (insErr) throw insErr;
        mergeRow = buildMergeRow(mergeId, data.created_at);
      }

      toast.addToast('success', 'Batida adicionada com sucesso.');
      setShowAddModal(false);
      await loadEspelho();
      if (mergeRow && mergeId) {
        setRecords((prev) => {
          if (prev.some((r) => r.id === mergeId)) return prev;
          return [...prev, mergeRow!].sort(
            (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
          );
        });
      }
      invalidateAfterPunch(data.user_id, cid);
    } catch (err) {
      console.error(err);
      toast.addToast('error', 'Erro ao adicionar batida.');
    }
  };

  const handleExportCSV = () => {
    if (!filterUserId || !periodValid) return;
    const emp = employees.find((e) => e.id === filterUserId);
    const rows: string[] = [
      'Data,Colaborador,Entrada,Saída Intervalo,Volta Intervalo,Saída,Horas trabalhadas',
    ];
    for (const date of periodDates) {
      const day = empMirror.get(date);
      if (!day) continue;
      const dash = (v: string | null | undefined) => (v != null && String(v).trim() !== '' ? v : EMPTY_DASH);
      rows.push(
        [
          formatDateBR(date),
          emp?.nome || '',
          dash(day.entradaInicio),
          dash(day.saidaIntervalo),
          dash(day.voltaIntervalo),
          dash(day.saidaFinal),
          day.workedMinutes > 0 ? formatMinutes(day.workedMinutes) : EMPTY_DASH,
        ].join(','),
      );
    }
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `espelho-${filterUserId}-${periodStart}-${periodEnd}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const handleExportExcel = () => {
    handleExportCSV();
    toast.addToast('info', 'Arquivo gerado no formato CSV (compatível com Excel).');
  };

  const handleExportPDF = () => {
    if (!filterUserId || !periodValid) {
      toast.addToast('error', 'Selecione um colaborador e período válido.');
      return;
    }

    // Importar jsPDF dinamicamente
    import('jspdf').then(({ jsPDF }) => {
      import('jspdf-autotable').then(() => {
        const doc = new jsPDF({
          orientation: 'landscape', // Paisagem = mais espaço horizontal
          unit: 'mm',
          format: 'a4',
        });

        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 10;
        let yPosition = margin;

        // Dados do colaborador
        const employee = employees.find(e => e.id === filterUserId);
        const employeeName = employee?.nome || filterUserId;

        // CABEÇALHO
        doc.setFillColor(41, 128, 185);
        doc.rect(0, 0, pageWidth, 25, 'F');

        doc.setTextColor(255, 255, 255);
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.text('PontoWebDesk', pageWidth / 2, 12, { align: 'center' });

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text('Sistema de Registro de Ponto', pageWidth / 2, 19, { align: 'center' });

        yPosition = 35;

        // Título do relatório
        doc.setTextColor(33, 37, 41);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('Espelho de Ponto', margin, yPosition);
        yPosition += 8;

        // Dados do colaborador e período
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`Colaborador: ${employeeName}`, margin, yPosition);
        yPosition += 6;
        doc.text(`Período: ${periodStart} a ${periodEnd}`, margin, yPosition);
        yPosition += 6;
        doc.text(`Empresa: ${user?.nome || user?.companyId || ''}`, margin, yPosition);
        yPosition += 10;

        // Linha separadora
        doc.setDrawColor(200, 200, 200);
        doc.line(margin, yPosition, pageWidth - margin, yPosition);
        yPosition += 8;

        // TABELA DO ESPELHO DE PONTO (formato correto)
        if (empMirror && empMirror.size > 0) {
          // Converter o Map para array e ordenar por data
          const mirrorEntries = Array.from(empMirror.entries()).sort((a, b) => a[0].localeCompare(b[0]));

          const tableData = mirrorEntries.map(([dateKey, day]) => {
            // Formatar data para pt-BR (YYYY-MM-DD -> DD/MM/YYYY)
            const [year, month, dayNum] = dateKey.split('-');
            const formattedDate = `${dayNum}/${month}/${year}`;

            // Formatar horários
            const entrada = day.entradaInicio || '----';
            const saidaInt = day.saidaIntervalo || 'Folga';
            const voltaInt = day.voltaIntervalo || 'Folga';
            const saida = day.saidaFinal || '----';

            // Calcular total em formato HH:MM
            let total = '----';
            if (day.workedMinutes && day.workedMinutes > 0) {
              const hours = Math.floor(day.workedMinutes / 60);
              const mins = day.workedMinutes % 60;
              total = `${hours}:${String(mins).padStart(2, '0')}`;
            }

            // Detectar se é folga (nenhuma batida)
            const isFolga = !day.entradaInicio && !day.saidaFinal;

            if (isFolga) {
              return [formattedDate, 'Folga', 'Folga', 'Folga', 'Folga', '----'];
            }

            return [formattedDate, entrada, saidaInt, voltaInt, saida, total];
          });

          (doc as any).autoTable({
            startY: yPosition,
            margin: { left: margin, right: margin },
            head: [['Data', 'Entrada', 'Saída Int.', 'Volta Int.', 'Saída', 'Total']],
            body: tableData,
            styles: {
              fontSize: 8,
              cellPadding: 2,
              overflow: 'linebreak',
              halign: 'center',
            },
            headStyles: {
              fillColor: [41, 128, 185],
              textColor: 255,
              fontStyle: 'bold',
              halign: 'center',
            },
            alternateRowStyles: {
              fillColor: [245, 245, 245],
            },
            columnStyles: {
              0: { cellWidth: 18, halign: 'left' },  // Data
              1: { cellWidth: 15 },  // Entrada
              2: { cellWidth: 18 },  // Saída Int.
              3: { cellWidth: 18 },  // Volta Int.
              4: { cellWidth: 15 },  // Saída
              5: { cellWidth: 12 },  // Total
            },
            tableWidth: 'auto',
          });

        } else {
          doc.setFontSize(11);
          doc.text('Nenhum registro encontrado para o período selecionado.', margin, yPosition);
        }

        // Rodapé com data de geração
        doc.setFontSize(8);
        doc.setTextColor(128, 128, 128);
        doc.text(
          `Gerado em ${new Date().toLocaleString('pt-BR')} - PontoWebDesk`,
          pageWidth / 2,
          doc.internal.pageSize.getHeight() - 10,
          { align: 'center' }
        );

        // Download
        const filename = `espelho-ponto-${employeeName.replace(/\s+/g, '-')}-${periodStart}-${periodEnd}.pdf`;
        doc.save(filename);

        toast.addToast('success', 'PDF exportado com sucesso!');
      });
    }).catch((err) => {
      console.error('Erro ao carregar jsPDF:', err);
      toast.addToast('error', 'Erro ao gerar PDF. Tente novamente.');
    });
  };

  const handleCloseMonth = async () => {
    if (!companyId || !filterUserId) {
      toast.addToast('error', 'Selecione um colaborador para fechar a folha.');
      return;
    }
    const [y, m] = closingMonth.split('-').map(Number);
    if (!y || !m) return;
    setClosingLoading(true);
    try {
      const already = await isTimesheetClosed(companyId, m, y);
      if (already) {
        toast.addToast('info', 'Este mês já consta como fechado.');
        return;
      }
      await closeTimesheet(companyId, m, y, filterUserId);
      invalidateAfterTimesheetMonthClose(companyId);
      toast.addToast('success', 'Folha fechada com sucesso.');
      await loadEspelho();
    } catch (e) {
      console.error(e);
      toast.addToast('error', 'Não foi possível fechar a folha.');
    } finally {
      setClosingLoading(false);
    }
  };

  const renderTimeCell = (time: string | null, record?: TimeRecord) => {
    const isManual = !!(record && isManualRecord(record));
    const fromRep = !!(record && isRepMirrorRecord(record));
    const display = time != null && String(time).trim() !== '' ? String(time).trim() : EMPTY_DASH;
    const isEmpty = display === EMPTY_DASH;
    const clickable = !!(record && isManual);
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-1 rounded text-sm font-medium ${
          clickable
            ? 'cursor-pointer'
            : isEmpty
              ? 'cursor-default text-slate-400 dark:text-slate-500'
              : 'cursor-default text-slate-700 dark:text-slate-300'
        } ${
          isManual
            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-300 dark:border-blue-700'
            : ''
        }`}
        onClick={() => {
          if (!clickable || !record) return;
          const ts = (record.timestamp && String(record.timestamp).trim()) || record.created_at;
          setRecordToEdit({ ...record, created_at: ts });
          setShowEditModal(true);
        }}
        title={
          isEmpty
            ? 'Sem batida'
            : isManual
              ? `Batida manual: ${record?.manual_reason || 'Sem motivo'}. Clique para editar. · Origem: ${resolvePunchOrigin(record!).label}`
              : `${fromRep ? 'Batida do registrador (REP / relógio)' : 'Batida pelo app/dispositivo'}. Não editável no espelho. · Origem: ${record ? resolvePunchOrigin(record).label : '—'}`
        }
      >
        {display}
        {isManual && <span className="text-blue-500 font-bold">*</span>}
        {fromRep && !isManual && (
          <span
            className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400"
            aria-hidden
          >
            REP
          </span>
        )}
      </span>
    );
  };

  if (loading) return <LoadingState message="Carregando..." />;
  if (!user) return <Navigate to="/" replace />;
  if (user.role !== 'admin' && user.role !== 'hr') {
    return <Navigate to="/dashboard" replace />;
  }

  const selectedEmployee = employees.find((e) => e.id === filterUserId);

  return (
    <div className="space-y-6 print:space-y-4">
      <PageHeader title="Espelho de Ponto" />

      {/* FILTROS — layout original (departamento → colaborador → período) */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/80 shadow-sm backdrop-blur-sm print:border print:shadow-none">
        <div className="px-4 pt-4 pb-2 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Filtros</h2>
        </div>
        {loadingFiltros && employees.length === 0 ? (
          <SkeletonFiltro />
        ) : (
          <div className="p-4 flex flex-wrap gap-4 items-end">
            <div className="min-w-[200px] flex-1">
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Departamento</label>
              <select
                value={filterDepartmentId}
                onChange={(e) => {
                  setFilterDepartmentId(e.target.value);
                  setFilterUserId('');
                }}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              >
                <option value="">Todos</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-[220px] flex-1">
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Colaborador</label>
              <select
                value={filterUserId}
                onChange={(e) => setFilterUserId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              >
                <option value="">Selecione o colaborador</option>
                {filteredEmployees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.nome}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Período (início)</label>
              <input
                type="date"
                value={periodStart}
                max={todayMax}
                onChange={(e) => setPeriodStart(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Período (fim)</label>
              <input
                type="date"
                value={periodEnd}
                max={todayMax}
                onChange={(e) => setPeriodEnd(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              />
            </div>
            {!periodValid && (periodStart || periodEnd) && (
              <p className="w-full text-xs text-amber-700 dark:text-amber-300">
                Informe início e fim, com início ≤ fim, e datas não posteriores a hoje.
              </p>
            )}
            {!periodStart && !periodEnd && (
              <p className="w-full text-xs text-slate-500 dark:text-slate-400">
                Selecione o período para carregar os registros do espelho.
              </p>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="inline-flex items-center gap-2 shrink-0"
              disabled={!periodValid || loadingEspelho || !companyId}
              title="Recarrega batidas do servidor (útil após importar do relógio ou outro terminal)"
              onClick={() => {
                if (companyId) invalidateCompanyListCaches(companyId);
                void loadEspelho();
              }}
            >
              <RefreshCw className={`w-4 h-4 ${loadingEspelho ? 'animate-spin' : ''}`} aria-hidden />
              Atualizar batidas
            </Button>
          </div>
        )}
      </section>

      {/* EXPORTAR E BATIDAS */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/80 shadow-sm backdrop-blur-sm print:hidden">
        <div className="px-4 pt-4 pb-2 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Exportar e batidas
          </h2>
        </div>
        <div className="p-4 flex flex-wrap gap-3 items-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="inline-flex items-center gap-2"
            disabled={!filterUserId || !periodValid || loadingEspelho}
            onClick={handleExportPDF}
          >
            <FileDown className="w-4 h-4" />
            Exportar PDF
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="inline-flex items-center gap-2"
            disabled={!filterUserId || !periodValid || loadingEspelho}
            onClick={handleExportExcel}
          >
            <FileSpreadsheet className="w-4 h-4" />
            Exportar Excel
          </Button>
          <Button
            type="button"
            size="sm"
            className="inline-flex items-center gap-2"
            onClick={() => setShowAddModal(true)}
          >
            <Plus className="w-4 h-4" />
            Adicionar batida
          </Button>
          <Link
            to={
              filterUserId
                ? `/admin/import-rep?forceUserId=${encodeURIComponent(filterUserId)}`
                : '/admin/import-rep'
            }
            className="inline-flex items-center justify-center gap-2 font-bold rounded-2xl transition-all active:scale-[0.98] border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 px-4 py-2 text-xs"
            title={
              filterUserId
                ? 'Envie um AFD/TXT do relógio e atribua as batidas a este colaborador (quando o PIS do arquivo não casa com o cadastro)'
                : 'Importar arquivo AFD ou TXT das marcações'
            }
          >
            <Upload className="w-4 h-4" aria-hidden />
            Importar arquivo REP
          </Link>
        </div>
      </section>

      {/* FECHAMENTO MENSAL */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/80 shadow-sm backdrop-blur-sm print:hidden">
        <div className="px-4 pt-4 pb-2 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Fechamento mensal
          </h2>
        </div>
        <div className="p-4 flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Mês a fechar</label>
            <input
              type="month"
              value={closingMonth}
              onChange={(e) => setClosingMonth(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="inline-flex items-center gap-2"
            disabled={closingLoading || !filterUserId}
            onClick={() => void handleCloseMonth()}
          >
            <Lock className="w-4 h-4" />
            {closingLoading ? 'Fechando…' : 'Fechar folha'}
          </Button>
        </div>
      </section>

      {/* Legenda + filtro de batidas */}
      <div className="flex flex-wrap gap-3 text-sm text-slate-600 dark:text-slate-400 print:text-xs">
        <button
          type="button"
          onClick={() => setRecordTypeFilter('manual')}
          className={`inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors ${
            recordTypeFilter === 'manual'
              ? 'bg-indigo-600 text-white'
              : 'bg-slate-50 dark:bg-slate-800/70 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
          }`}
        >
          <span className="w-3 h-3 rounded-full bg-blue-500" />
          Batida manual (*)
        </button>
        <button
          type="button"
          onClick={() => setRecordTypeFilter('normal')}
          className={`inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors ${
            recordTypeFilter === 'normal'
              ? 'bg-indigo-600 text-white'
              : 'bg-slate-50 dark:bg-slate-800/70 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
          }`}
        >
          <span className="w-3 h-3 rounded-full border border-slate-400" />
          Batida normal
        </button>
        <button
          type="button"
          onClick={() => setRecordTypeFilter('all')}
          className={`inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors ${
            recordTypeFilter === 'all'
              ? 'bg-indigo-600 text-white'
              : 'bg-slate-50 dark:bg-slate-800/70 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
          }`}
        >
          Mostrar todas
        </button>
      </div>

      {/* Tabela */}
      {!periodValid && !periodStart && !periodEnd ? (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-600 p-12 text-center text-slate-500 dark:text-slate-400">
          Selecione o período (início e fim) para visualizar o espelho de ponto.
        </div>
      ) : !periodValid ? (
        <div className="rounded-2xl border border-dashed border-amber-200 dark:border-amber-900/50 p-12 text-center text-amber-800 dark:text-amber-200 text-sm">
          Ajuste o período: início e fim obrigatórios, início ≤ fim, e sem datas futuras.
        </div>
      ) : !filterUserId ? (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-600 p-12 text-center text-slate-500 dark:text-slate-400">
          Selecione o colaborador
        </div>
      ) : loadingEspelho ? (
        <TimesheetTableSkeleton variant="admin" />
      ) : (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm overflow-visible print:border print:shadow-none">
          <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700">
            <h3 className="font-semibold text-slate-900 dark:text-white">{selectedEmployee?.nome || 'Colaborador'}</h3>
            <p className="text-sm text-slate-500">
              {departments.find((d) => d.id === selectedEmployee?.department_id)?.name || '—'} ·{' '}
              {formatDateBR(periodStart)} a {formatDateBR(periodEnd)}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-400">Data</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-400">Entrada</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-400">Saída int.</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-400">Volta int.</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-400">Saída</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-400">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {periodDates.map((date) => {
                  const day = empMirror.get(date);
                  if (!day) return null;
                  const hasRealRecords = day.records.some((r) => !isStatusRecord(r));
                  const dayStatus = getDayStatus(
                    day,
                    scheduleWorkDays ?? undefined,
                    expectedWindowForYmd(date),
                    holidayDates,
                  );
                  let dataNote: 'Folga' | 'Falta' | 'Feriado' | null = null;
                  if (holidayDates.has(date)) dataNote = 'Feriado';
                  else if (dayStatus.status === 'folga') dataNote = 'Folga';
                  else if (dayStatus.status === 'falta') dataNote = 'Falta';
                  const fmt = (iso: string) =>
                    new Date(iso).toLocaleTimeString('pt-BR', {
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: false,
                    });
                  const hhmmToMin = (hhmm: string | null | undefined): number | null => {
                    if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return null;
                    const [h, m] = hhmm.split(':').map((v) => Number(v));
                    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
                    return h * 60 + m;
                  };
                  const recordIsoForDay = (r: TimeRecord) => recordEffectiveMirrorInstant(r, date);
                  const fmtRecord = (r: TimeRecord) => fmt(recordIsoForDay(r));
                  const pick = (t: string | null, typ: ReturnType<typeof normalizeRecordTypeForMirror>) => {
                    if (!t) return undefined;
                    return (
                      day.records.find((r) => normalizeRecordTypeForMirror(r.type) === typ && fmtRecord(r) === t) ||
                      day.records.find((r) => fmtRecord(r) === t)
                    );
                  };
                  const entradaRecord = day.entradaInicio
                    ? (() => {
                        const sameTime = day.records.filter((r) => fmtRecord(r) === day.entradaInicio);
                        const rep = sameTime.find((r) => isRepMirrorRecord(r));
                        return (
                          rep ||
                          sameTime.find((r) => normalizeRecordTypeForMirror(r.type) === 'entrada') ||
                          sameTime[0]
                        );
                      })()
                    : undefined;
                  const saidaIntRecord = pick(day.saidaIntervalo, 'intervalo_saida');
                  let voltaIntRecord = pick(day.voltaIntervalo, 'intervalo_volta');
                  const saidaRecord = pick(day.saidaFinal, 'saida');
                  let voltaSlotTime = day.voltaIntervalo;

                  // Fallback visual: se a volta ficou vazia, mas existe batida entre saída de intervalo e saída final,
                  // exibe essa batida na coluna "Volta int." para não "sumir" no espelho.
                  if (!voltaSlotTime && day.saidaIntervalo) {
                    const startMin = hhmmToMin(day.saidaIntervalo);
                    const endMin = hhmmToMin(day.saidaFinal);
                    const hasRecord = (r?: TimeRecord) => !!r?.id;
                    const takenIds = new Set<string>(
                      [entradaRecord, saidaIntRecord, voltaIntRecord, saidaRecord]
                        .filter(hasRecord)
                        .map((r) => r!.id),
                    );
                    const candidates = day.records
                      .filter((r) => !isStatusRecord(r))
                      .filter((r) => !takenIds.has(r.id))
                      .map((r) => ({ rec: r, time: fmtRecord(r), min: hhmmToMin(fmtRecord(r)) }))
                      .filter((x) => x.min != null && (startMin == null || x.min > startMin))
                      .filter((x) => endMin == null || x.min < endMin)
                      .sort((a, b) => (a.min ?? 0) - (b.min ?? 0));
                    if (candidates.length > 0) {
                      voltaIntRecord = candidates[0]!.rec;
                      voltaSlotTime = candidates[0]!.time;
                    }
                  }
                  const renderMirrorSlot = (t: string | null, rec?: TimeRecord) => {
                    const hasTime = t != null && String(t).trim() !== '';
                    if (hasTime) return renderTimeCell(t, rec);
                    if (dataNote === 'Falta') {
                      return (
                        <span className="inline-flex px-2 py-1 rounded text-sm font-semibold text-red-600 dark:text-red-400">
                          Falta
                        </span>
                      );
                    }
                    if (dataNote === 'Folga') {
                      return (
                        <span className="inline-flex px-2 py-1 rounded text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                          Folga
                        </span>
                      );
                    }
                    if (dataNote === 'Feriado') {
                      return (
                        <span className="inline-flex px-2 py-1 rounded text-sm font-semibold text-amber-700 dark:text-amber-300">
                          Feriado
                        </span>
                      );
                    }
                    return renderTimeCell(null, undefined);
                  };
                  return (
                    <tr key={date} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                      <td className="px-3 py-2 text-slate-800 dark:text-slate-200 whitespace-nowrap align-top">
                        <div>{formatDateBR(date)}</div>
                        {dataNote && (
                          <div
                            className={`text-xs font-semibold mt-0.5 ${
                              dataNote === 'Falta'
                                ? 'text-red-600 dark:text-red-400'
                                : dataNote === 'Folga'
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : dataNote === 'Feriado'
                                    ? 'text-amber-700 dark:text-amber-300'
                                    : 'text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            {dataNote}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {renderMirrorSlot(hasRealRecords ? day.entradaInicio : null, hasRealRecords ? entradaRecord : undefined)}
                      </td>
                      <td className="px-3 py-2">
                        {renderMirrorSlot(hasRealRecords ? day.saidaIntervalo : null, hasRealRecords ? saidaIntRecord : undefined)}
                      </td>
                      <td className="px-3 py-2">
                        {renderMirrorSlot(hasRealRecords ? voltaSlotTime : null, hasRealRecords ? voltaIntRecord : undefined)}
                      </td>
                      <td className="px-3 py-2">
                        {renderMirrorSlot(hasRealRecords ? day.saidaFinal : null, hasRealRecords ? saidaRecord : undefined)}
                      </td>
                      <td className="px-3 py-2 font-medium text-slate-700 dark:text-slate-300">
                        {hasRealRecords && day.workedMinutes > 0 ? formatMinutes(day.workedMinutes) : EMPTY_DASH}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <AddTimeRecordModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSubmit={handleAddRecord}
        employees={filteredEmployees}
        companyId={companyId}
      />
      <EditTimeRecordModal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setRecordToEdit(null);
        }}
        record={recordToEdit}
        onSave={() => {
          setShowEditModal(false);
          setRecordToEdit(null);
          void loadEspelho();
        }}
      />
    </div>
  );
};

export default AdminTimesheet;
