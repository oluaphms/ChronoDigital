import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Banknote, Download, FileText, Lock, LockOpen, RefreshCw } from 'lucide-react';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import PageHeader from '../../components/PageHeader';
import { db, isSupabaseConfigured } from '../../services/supabaseClient';
import { LoadingState } from '../../../components/UI';
import RoleGuard from '../../components/auth/RoleGuard';
import {
  consolidarFolhaPeriodo,
  fecharFolhaPeriodo,
  reabrirFolhaPeriodo,
} from '../../services/payrollService';

function fmtBRL(n: number): string {
  return (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

interface PeriodoRow {
  id: string;
  ano: number;
  mes: number;
  status: string;
  fechada_em: string | null;
}

interface ItemRow {
  id: string;
  user_id: string;
  email: string;
  salario_base: number;
  total_proventos: number;
  total_descontos: number;
  liquido: number;
  nome?: string;
}

const AdminFolhaPagamento: React.FC = () => {
  const { user, loading } = useCurrentUser();
  const now = new Date();
  const [ano, setAno] = useState(now.getFullYear());
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [periodo, setPeriodo] = useState<PeriodoRow | null>(null);
  const [itens, setItens] = useState<ItemRow[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!user?.companyId || !isSupabaseConfigured) {
      setLoadingData(false);
      return;
    }
    setLoadingData(true);
    setMessage(null);
    try {
      const periodos = (await db.select('folha_pagamento_periodos', [
        { column: 'company_id', operator: 'eq', value: user.companyId },
        { column: 'ano', operator: 'eq', value: ano },
        { column: 'mes', operator: 'eq', value: mes },
      ])) as any[];
      const p = periodos?.[0];
      if (!p) {
        setPeriodo(null);
        setItens([]);
        setLoadingData(false);
        return;
      }
      setPeriodo({
        id: p.id,
        ano: p.ano,
        mes: p.mes,
        status: p.status,
        fechada_em: p.fechada_em,
      });
      const rawItens = (await db.select('folha_pagamento_itens', [
        { column: 'periodo_id', operator: 'eq', value: p.id },
      ])) as any[];
      const users = (await db.select('users', [{ column: 'company_id', operator: 'eq', value: user.companyId }])) as any[];
      const nomeById = new Map((users ?? []).map((u: any) => [u.id, u.nome || u.email || '—']));
      const emailById = new Map((users ?? []).map((u: any) => [u.id, u.email || '']));
      setItens(
        (rawItens ?? []).map((r: any) => ({
          id: r.id,
          user_id: r.user_id,
          email: emailById.get(r.user_id) || '',
          salario_base: Number(r.salario_base) || 0,
          total_proventos: Number(r.total_proventos) || 0,
          total_descontos: Number(r.total_descontos) || 0,
          liquido: Number(r.liquido) || 0,
          nome: nomeById.get(r.user_id) || '—',
        })),
      );
    } catch (e: any) {
      console.error(e);
      setMessage({ type: 'error', text: e?.message || 'Erro ao carregar folha.' });
    } finally {
      setLoadingData(false);
    }
  }, [user?.companyId, ano, mes]);

  useEffect(() => {
    load();
  }, [load]);

  const totais = useMemo(() => {
    let bruto = 0;
    let desc = 0;
    let liq = 0;
    for (const r of itens) {
      bruto += r.salario_base + r.total_proventos;
      desc += r.total_descontos;
      liq += r.liquido;
    }
    return { bruto, desc, liq };
  }, [itens]);

  const handleConsolidar = async () => {
    if (!user?.companyId) return;
    setBusy(true);
    setMessage(null);
    try {
      const r = await consolidarFolhaPeriodo(user.companyId, ano, mes);
      setMessage({
        type: 'success',
        text: `Folha consolidada: ${r.funcionarios} funcionário(s).`,
      });
      await load();
    } catch (e: any) {
      setMessage({ type: 'error', text: e?.message || 'Erro ao consolidar.' });
    } finally {
      setBusy(false);
    }
  };

  const handleFechar = async () => {
    if (!periodo || !user?.id) return;
    if (!confirm('Fechar este período? Após fechar, a reabertura permite nova consolidação.')) return;
    setBusy(true);
    setMessage(null);
    try {
      await fecharFolhaPeriodo(periodo.id, user.id);
      setMessage({ type: 'success', text: 'Período fechado.' });
      await load();
    } catch (e: any) {
      setMessage({ type: 'error', text: e?.message || 'Erro ao fechar.' });
    } finally {
      setBusy(false);
    }
  };

  const handleReabrir = async () => {
    if (!periodo) return;
    if (!confirm('Reabrir o período como rascunho?')) return;
    setBusy(true);
    setMessage(null);
    try {
      await reabrirFolhaPeriodo(periodo.id);
      setMessage({ type: 'success', text: 'Período reaberto para edição.' });
      await load();
    } catch (e: any) {
      setMessage({ type: 'error', text: e?.message || 'Erro ao reabrir.' });
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = () => {
    const header = ['nome', 'email', 'salario_base', 'proventos_lancamentos', 'descontos', 'liquido'];
    const lines = [header.join(';')];
    for (const r of itens) {
      lines.push(
        [
          `"${(r.nome || '').replace(/"/g, '""')}"`,
          r.email || r.user_id,
          r.salario_base.toFixed(2).replace('.', ','),
          r.total_proventos.toFixed(2).replace('.', ','),
          r.total_descontos.toFixed(2).replace('.', ','),
          r.liquido.toFixed(2).replace('.', ','),
        ].join(';'),
      );
    }
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `folha_${ano}_${String(mes).padStart(2, '0')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = () => {
    try {
      const doc = new jsPDF({ orientation: 'landscape' });
      doc.setFontSize(16);
      doc.text('ChronoDigital — Folha de pagamento (resumo)', 14, 14);
      doc.setFontSize(10);
      const competencia = `${String(mes).padStart(2, '0')}/${ano}`;
      let y = 22;
      doc.text(`Competência: ${competencia}`, 14, y);
      y += 6;
      if (periodo) {
        doc.text(`Status: ${periodo.status === 'fechada' ? 'Fechada' : 'Rascunho'}`, 14, y);
        y += 6;
      }

      const sumBase = itens.reduce((s, r) => s + r.salario_base, 0);
      const sumProv = itens.reduce((s, r) => s + r.total_proventos, 0);
      const sumDesc = itens.reduce((s, r) => s + r.total_descontos, 0);
      const sumLiq = itens.reduce((s, r) => s + r.liquido, 0);

      const head = [['Colaborador', 'E-mail', 'Salário base', 'Proventos (evt.)', 'Descontos', 'Líquido']];
      const body = itens.map((r) => [
        r.nome ?? '—',
        r.email || '—',
        fmtBRL(r.salario_base),
        fmtBRL(r.total_proventos),
        fmtBRL(r.total_descontos),
        fmtBRL(r.liquido),
      ]);
      const foot = [['Totais', '', fmtBRL(sumBase), fmtBRL(sumProv), fmtBRL(sumDesc), fmtBRL(sumLiq)]];

      autoTable(doc, {
        head,
        body,
        foot,
        startY: y + 2,
        styles: { fontSize: 9 },
        headStyles: { fillColor: [79, 70, 229] },
        footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
        margin: { left: 14, right: 14 },
      });

      const d = doc as jsPDF & { lastAutoTable?: { finalY: number } };
      const finalY = (d.lastAutoTable?.finalY ?? y) + 10;
      doc.setFontSize(7);
      doc.setTextColor(80, 80, 80);
      doc.text(
        'Documento informativo: somatórios por lançamentos. Não substitui folha oficial nem discrimina INSS, IRRF, FGTS, férias, 13º ou demais encargos legais.',
        14,
        finalY,
        { maxWidth: 260 },
      );
      doc.save(`folha_${ano}_${String(mes).padStart(2, '0')}.pdf`);
    } catch (e) {
      console.error('Export PDF falhou:', e);
      setMessage({ type: 'error', text: 'Não foi possível gerar o PDF. Tente novamente.' });
    }
  };

  if (loading) return <LoadingState message="Carregando..." />;
  if (!user) return <Navigate to="/" replace />;

  const fechada = periodo?.status === 'fechada';
  const meses = Array.from({ length: 12 }, (_, i) => i + 1);
  const anos = Array.from({ length: 8 }, (_, i) => now.getFullYear() - 3 + i);

  return (
    <RoleGuard user={user} allowedRoles={['admin', 'hr']}>
      <div className="space-y-6">
        {message && (
          <div
            className={`p-4 rounded-xl text-sm ${
              message.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
                : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
            }`}
          >
            {message.text}
          </div>
        )}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <PageHeader
            title="Folha de pagamento"
            subtitle="Modelo simplificado: salário base no cadastro + lançamentos de eventos (provento/desconto). Não calcula automaticamente INSS, IRRF, FGTS, DSR sobre salário, férias + 1/3, 13º salário nem demais encargos legais — isso exige motor tributário e tabelas atualizadas continuamente. Use para conferência interna e exportação; a folha oficial da empresa prevalece."
            icon={<Banknote size={24} />}
          />
        </div>

        <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 p-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Ano</label>
            <select
              value={ano}
              onChange={(e) => setAno(parseInt(e.target.value, 10))}
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            >
              {anos.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Mês</label>
            <select
              value={mes}
              onChange={(e) => setMes(parseInt(e.target.value, 10))}
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            >
              {meses.map((m) => (
                <option key={m} value={m}>
                  {String(m).padStart(2, '0')}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={handleConsolidar}
            disabled={busy || fechada}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} />
            {fechada ? 'Período fechado' : 'Consolidar folha'}
          </button>
          {periodo && !fechada && (
            <button
              type="button"
              onClick={handleFechar}
              disabled={busy || itens.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 font-medium hover:bg-amber-50 dark:hover:bg-amber-900/20 disabled:opacity-50"
            >
              <Lock className="w-4 h-4" /> Fechar período
            </button>
          )}
          {periodo && fechada && (
            <button
              type="button"
              onClick={handleReabrir}
              disabled={busy}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 font-medium hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
            >
              <LockOpen className="w-4 h-4" /> Reabrir
            </button>
          )}
          <div className="flex flex-wrap items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={exportPdf}
              disabled={itens.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 font-medium hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
            >
              <FileText className="w-4 h-4" /> Exportar PDF
            </button>
            <button
              type="button"
              onClick={exportCsv}
              disabled={itens.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 font-medium hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
            >
              <Download className="w-4 h-4" /> Exportar CSV
            </button>
          </div>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/40 px-4 py-3 leading-relaxed">
          Aviso: valores aqui são somatórios informados por lançamentos. Não representam obrigações previdenciárias, trabalhistas ou fiscais calculadas por este sistema.
        </p>

        {periodo && (
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Status:{' '}
            <strong className={fechada ? 'text-amber-700 dark:text-amber-300' : 'text-slate-900 dark:text-white'}>
              {fechada ? 'Fechada' : 'Rascunho'}
            </strong>
            {fechada && periodo.fechada_em && (
              <span className="text-slate-500"> — {new Date(periodo.fechada_em).toLocaleString('pt-BR')}</span>
            )}
          </p>
        )}

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 overflow-hidden">
          {loadingData ? (
            <div className="p-12 text-center text-slate-500">Carregando...</div>
          ) : (
            <>
              <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 flex flex-wrap gap-4 text-sm">
                <span>
                  Referência bruta (base + prov.): <strong>{fmtBRL(totais.bruto)}</strong>
                </span>
                <span>
                  Descontos: <strong>{fmtBRL(totais.desc)}</strong>
                </span>
                <span>
                  Líquido total: <strong className="text-emerald-700 dark:text-emerald-300">{fmtBRL(totais.liq)}</strong>
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                      <th className="text-left px-4 py-3 font-bold text-slate-500 dark:text-slate-400">Colaborador</th>
                      <th className="text-right px-4 py-3 font-bold text-slate-500 dark:text-slate-400">Salário base</th>
                      <th className="text-right px-4 py-3 font-bold text-slate-500 dark:text-slate-400">Proventos (evt.)</th>
                      <th className="text-right px-4 py-3 font-bold text-slate-500 dark:text-slate-400">Descontos</th>
                      <th className="text-right px-4 py-3 font-bold text-slate-500 dark:text-slate-400">Líquido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itens.map((row) => (
                      <tr key={row.id} className="border-b border-slate-100 dark:border-slate-800">
                        <td className="px-4 py-3 text-slate-900 dark:text-white font-medium">{row.nome}</td>
                        <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">{fmtBRL(row.salario_base)}</td>
                        <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">{fmtBRL(row.total_proventos)}</td>
                        <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">{fmtBRL(row.total_descontos)}</td>
                        <td className="px-4 py-3 text-right font-semibold text-emerald-700 dark:text-emerald-300">{fmtBRL(row.liquido)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!loadingData && itens.length === 0 && (
                <p className="p-8 text-center text-slate-500 dark:text-slate-400">
                  Nenhum dado para este período. Defina <strong>salário base</strong> nos colaboradores, cadastre <strong>eventos</strong> com natureza (provento/desconto), faça os{' '}
                  <strong>lançamentos</strong> no mês e clique em <strong>Consolidar folha</strong>.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </RoleGuard>
  );
};

export default AdminFolhaPagamento;
