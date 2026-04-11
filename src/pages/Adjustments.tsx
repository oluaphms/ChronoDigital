import React, { useEffect, useState, useCallback, useMemo } from "react";
import { Navigate } from "react-router-dom";
import { Clock12, CheckCircle2, XCircle, Eye, Plus, History, Check } from "lucide-react";
import { useCurrentUser } from "../hooks/useCurrentUser";
import PageHeader from "../components/PageHeader";
import { Button, LoadingState } from "../../components/UI";
import { useLanguage } from "../contexts/LanguageContext";
import { db, isSupabaseConfigured } from "../services/supabaseClient";
import { NotificationService } from "../../services/notificationService";
import { LoggingService } from "../../services/loggingService";
import { LogSeverity } from "../../types";
import { useToast } from "../components/ToastProvider";
import { AdjustmentFlowService } from "../services/adjustmentFlowService";
import type { AdjustmentRequest } from "../services/adjustmentFlowService";
import { queryCache, TTL } from "../services/queryCache";
import { AdjustmentHistoryModal } from "../components/AdjustmentHistoryModal";

// ─── Status badge ──────────────────────────────────────────────────────────
const STATUS_STYLES: Record<string, string> = {
  pending:  "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  rejected: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  approved: "Aprovado",
  rejected: "Rejeitado",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLES[status] ?? "bg-slate-100 text-slate-600"}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

// ─── Reject modal ──────────────────────────────────────────────────────────
function RejectModal({ onConfirm, onCancel, busy }: { onConfirm: (reason: string) => void; onCancel: () => void; busy: boolean }) {
  const [reason, setReason] = useState("");

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onClick={onCancel}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-bold text-slate-900 dark:text-white">Motivo da rejeicao</h3>
        <textarea
          className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm min-h-[80px]"
          placeholder="Descreva o motivo (opcional)"
          value={reason}
          onChange={e => setReason(e.target.value)}
        />
        <div className="flex gap-3">
          <Button variant="outline" size="sm" className="flex-1" onClick={onCancel} disabled={busy}>Cancelar</Button>
          <Button size="sm" className="flex-1 bg-red-600 hover:bg-red-700 text-white" onClick={() => onConfirm(reason)} disabled={busy}>
            {busy ? "Rejeitando..." : "Confirmar rejeicao"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Detail modal ──────────────────────────────────────────────────────────
function DetailModal({ row, userName, onClose }: { row: AdjustmentRequest; userName: string; onClose: () => void }) {
  const fields: [string, string][] = [
    ["Colaborador", userName],
    ["Data", row.date ?? "-"],
    ["Tipo", row.adjustment_type === "entrada" ? "Entrada" : row.adjustment_type === "saida" ? "Saida" : "Entrada e Saida"],
    ["Horario original", row.original_time ?? "-"],
    ["Horario solicitado", row.requested_time],
    ["Motivo", row.reason],
    ["Status", STATUS_LABELS[row.status] ?? row.status],
    ["Criado em", new Date(row.created_at).toLocaleString("pt-BR")],
    ...(row.rejection_reason ? [["Motivo rejeicao", row.rejection_reason] as [string, string]] : []),
    ...(row.reviewed_at ? [["Revisado em", new Date(row.reviewed_at).toLocaleString("pt-BR")] as [string, string]] : []),
  ];

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 w-full max-w-md max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">Detalhes do ajuste</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <XCircle className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 min-h-0">
          {fields.map(([label, value]) => (
            <div key={label}>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</p>
              <p className="text-sm text-slate-900 dark:text-white mt-0.5">{value}</p>
            </div>
          ))}
        </div>
        <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-800 shrink-0">
          <Button variant="outline" size="sm" className="w-full" onClick={onClose}>Fechar</Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────
const AdjustmentsPage: React.FC = () => {
  useLanguage();
  const { user, loading } = useCurrentUser();
  const toast = useToast();

  const isAdminView = user?.role === "admin" || user?.role === "hr";

  // ── State ──
  const [rows, setRows] = useState<AdjustmentRequest[]>([]);
  const [usersMap, setUsersMap] = useState<Map<string, string>>(new Map());
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [filterStatus, setFilterStatus] = useState<"all" | "pending" | "approved" | "rejected">("pending");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<AdjustmentRequest | null>(null);
  const [detailTarget, setDetailTarget] = useState<AdjustmentRequest | null>(null);
  const [historyTarget, setHistoryTarget] = useState<string | null>(null);

  // Employee form
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState({ date: "", requested_time: "09:00", adjustment_type: "entrada", reason: "", time_record_id: "" });
  const [submitting, setSubmitting] = useState(false);

  // ── Load ──
  const load = useCallback(async () => {
    if (!user || !isSupabaseConfigured) return;
    setIsLoadingData(true);
    try {
      const filters: { column: string; operator: string; value: any }[] = [];
      if (isAdminView) {
        filters.push({ column: "company_id", operator: "eq", value: user.companyId });
      } else {
        filters.push({ column: "user_id", operator: "eq", value: user.id });
      }
      const res = (await db.select("time_adjustments", filters, { column: "created_at", ascending: false }, 200)) ?? [];
      setRows(res.map((r: any) => ({
        id: r.id,
        user_id: r.user_id,
        time_record_id: r.time_record_id ?? null,
        date: r.date ?? null,
        original_time: r.original_time ?? null,
        requested_time: r.requested_time ?? "",
        adjustment_type: r.adjustment_type ?? "entrada",
        reason: r.reason ?? "",
        status: r.status ?? "pending",
        rejection_reason: r.rejection_reason ?? null,
        reviewed_by: r.reviewed_by ?? null,
        reviewed_at: r.reviewed_at ?? null,
        created_at: r.created_at,
        company_id: r.company_id ?? user.companyId,
      })));

      if (isAdminView) {
        const usersRows = await queryCache.getOrFetch(
          `users:${user.companyId}`,
          () => db.select("users", [{ column: "company_id", operator: "eq", value: user.companyId }]) as Promise<any[]>,
          TTL.NORMAL,
        );
        const map = new Map<string, string>();
        (usersRows ?? []).forEach((u: any) => map.set(u.id, u.nome || u.email || u.id.slice(0, 8)));
        setUsersMap(map);
      }
    } catch (e) {
      console.error("Erro ao carregar ajustes:", e);
    } finally {
      setIsLoadingData(false);
    }
  }, [user, isAdminView]);

  useEffect(() => { load(); }, [load]);

  // ── Filtered rows ──
  const filtered = useMemo(() =>
    filterStatus === "all" ? rows : rows.filter(r => r.status === filterStatus),
    [rows, filterStatus]
  );

  // ── Admin: approve ──
  const handleApprove = async (row: AdjustmentRequest) => {
    if (!user) return;
    setBusyId(row.id);
    try {
      await AdjustmentFlowService.approve({
        request: row,
        adminId: user.id,
        adminName: user.nome,
        companyId: user.companyId,
      });
      setRows(prev => prev.map(r => r.id === row.id ? { ...r, status: "approved", reviewed_by: user.id, reviewed_at: new Date().toISOString() } : r));
      toast.addToast("success", "Ajuste aprovado e ponto atualizado.");
    } catch (err: any) {
      toast.addToast("error", err?.message || "Erro ao aprovar ajuste.");
    } finally {
      setBusyId(null);
    }
  };

  // ── Admin: apply approved adjustment ──
  const handleApplyAdjustment = async (row: AdjustmentRequest) => {
    if (!user) return;
    setBusyId(row.id);
    try {
      const newTimestamp = `${row.date}T${row.requested_time}:00.000Z`;
      
      // Atualizar time_record se existir
      if (row.time_record_id) {
        await db.update('time_records', [{ column: 'id', operator: 'eq', value: row.time_record_id }], {
          created_at: newTimestamp,
          updated_at: new Date().toISOString(),
        });
      }

      // Registrar auditoria
      await LoggingService.log({
        severity: LogSeverity.SECURITY,
        action: 'ADMIN_APPLY_ADJUSTMENT',
        userId: user.id,
        userName: user.nome,
        companyId: user.companyId,
        details: {
          adjustmentId: row.id,
          employeeId: row.user_id,
          timeRecordId: row.time_record_id,
          newTimestamp: newTimestamp,
        },
      });

      toast.addToast('success', 'Ajuste aplicado ao ponto com sucesso.');
      await load();
    } catch (err: any) {
      toast.addToast('error', err?.message || 'Erro ao aplicar ajuste.');
    } finally {
      setBusyId(null);
    }
  };

  // ── Admin: reject ──
  const handleReject = async (reason: string) => {
    if (!user || !rejectTarget) return;
    setBusyId(rejectTarget.id);
    try {
      await AdjustmentFlowService.reject({
        request: rejectTarget,
        adminId: user.id,
        adminName: user.nome,
        companyId: user.companyId,
        rejectionReason: reason,
      });
      setRows(prev => prev.map(r => r.id === rejectTarget.id ? { ...r, status: "rejected", rejection_reason: reason, reviewed_by: user.id, reviewed_at: new Date().toISOString() } : r));
      toast.addToast("success", "Ajuste rejeitado.");
    } catch (err: any) {
      toast.addToast("error", err?.message || "Erro ao rejeitar ajuste.");
    } finally {
      setBusyId(null);
      setRejectTarget(null);
    }
  };

  // ── Employee: submit ──
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !isSupabaseConfigured || !form.reason.trim() || !form.date) {
      toast.addToast("error", "Preencha data, horario e motivo.");
      return;
    }
    setSubmitting(true);
    try {
      const id = crypto.randomUUID();
      await db.insert("time_adjustments", {
        id,
        user_id: user.id,
        company_id: user.companyId,
        time_record_id: form.time_record_id || null,
        date: form.date,
        requested_time: form.requested_time,
        adjustment_type: form.adjustment_type,
        status: "pending",
        reason: form.reason.trim(),
        created_at: new Date().toISOString(),
      });
      setRows(prev => [{
        id, user_id: user.id, company_id: user.companyId,
        time_record_id: form.time_record_id || null,
        date: form.date, original_time: null,
        requested_time: form.requested_time,
        adjustment_type: form.adjustment_type as any,
        reason: form.reason.trim(), status: "pending",
        rejection_reason: null, reviewed_by: null, reviewed_at: null,
        created_at: new Date().toISOString(),
      }, ...prev]);
      await NotificationService.create({
        userId: user.id, type: "info",
        title: "Ajuste solicitado",
        message: `Seu pedido de ajuste para ${form.date} foi registrado e aguarda aprovacao.`,
        metadata: { adjustmentId: id },
      });
      await LoggingService.log({
        severity: LogSeverity.INFO, action: "USER_REQUEST_ADJUSTMENT",
        userId: user.id, userName: user.nome, companyId: user.companyId,
        details: { date: form.date, requested_time: form.requested_time, adjustment_type: form.adjustment_type },
      });
      toast.addToast("success", "Solicitacao enviada com sucesso.");
      setIsModalOpen(false);
      setForm({ date: "", requested_time: "09:00", adjustment_type: "entrada", reason: "", time_record_id: "" });
    } catch (err: any) {
      toast.addToast("error", err?.message || "Erro ao enviar solicitacao.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingState message="Carregando ajustes..." />;
  if (!user) return <Navigate to="/" replace />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ajustes de Ponto"
        subtitle={isAdminView ? "Central de analise e aprovacao de ajustes de ponto" : "Solicite correcoes nos seus registros de ponto"}
        icon={<Clock12 className="w-5 h-5" />}
        actions={!isAdminView ? (
          <Button size="sm" onClick={() => setIsModalOpen(true)}>
            <Plus className="w-4 h-4" /> Solicitar ajuste
          </Button>
        ) : undefined}
      />

      {/* ── Filtros (admin) ── */}
      {isAdminView && (
        <div className="flex flex-wrap gap-2">
          {(["all", "pending", "approved", "rejected"] as const).map(s => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                filterStatus === s
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
              }`}
            >
              {s === "all" ? "Todos" : STATUS_LABELS[s]}
              {s === "pending" && rows.filter(r => r.status === "pending").length > 0 && (
                <span className="ml-1.5 bg-amber-500 text-white rounded-full px-1.5 py-0.5 text-[10px]">
                  {rows.filter(r => r.status === "pending").length}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* ── Tabela ── */}
      {isLoadingData ? (
        <LoadingState message="Carregando..." />
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 p-12 text-center text-slate-500 dark:text-slate-400 text-sm">
          {filterStatus === "pending" ? "Nenhum ajuste pendente." : "Nenhum registro encontrado."}
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                  {isAdminView && <th className="text-left px-4 py-3 font-bold text-slate-500 dark:text-slate-400">Colaborador</th>}
                  <th className="text-left px-4 py-3 font-bold text-slate-500 dark:text-slate-400">Data</th>
                  <th className="text-left px-4 py-3 font-bold text-slate-500 dark:text-slate-400">Tipo</th>
                  <th className="text-left px-4 py-3 font-bold text-slate-500 dark:text-slate-400">Original</th>
                  <th className="text-left px-4 py-3 font-bold text-slate-500 dark:text-slate-400">Solicitado</th>
                  <th className="text-left px-4 py-3 font-bold text-slate-500 dark:text-slate-400">Motivo</th>
                  <th className="text-left px-4 py-3 font-bold text-slate-500 dark:text-slate-400">Status</th>
                  <th className="text-right px-4 py-3 font-bold text-slate-500 dark:text-slate-400">Acoes</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(row => (
                  <tr key={row.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                    {isAdminView && (
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                        {usersMap.get(row.user_id) ?? row.user_id.slice(0, 8)}
                      </td>
                    )}
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300 tabular-nums whitespace-nowrap">
                      {row.date ? new Date(row.date + "T12:00:00").toLocaleDateString("pt-BR") : "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400 capitalize">
                      {row.adjustment_type === "ambos" ? "Entrada/Saida" : row.adjustment_type}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-500 dark:text-slate-400">
                      {row.original_time ? row.original_time.slice(11, 16) : "-"}
                    </td>
                    <td className="px-4 py-3 tabular-nums font-semibold text-indigo-600 dark:text-indigo-400">
                      {row.requested_time}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400 max-w-[180px] truncate" title={row.reason}>
                      {row.reason}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setDetailTarget(row)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
                          title="Ver detalhes"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setHistoryTarget(row.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                          title="Ver histórico"
                        >
                          <History className="w-4 h-4" />
                        </button>
                        {isAdminView && row.status === "pending" && (
                          <>
                            <button
                              onClick={() => handleApprove(row)}
                              disabled={busyId === row.id}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors disabled:opacity-40"
                              title="Aprovar"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setRejectTarget(row)}
                              disabled={busyId === row.id}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-40"
                              title="Rejeitar"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        {isAdminView && row.status === "approved" && (
                          <button
                            onClick={() => handleApplyAdjustment(row)}
                            disabled={busyId === row.id}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors disabled:opacity-40"
                            title="Efetuar ajuste"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Modal: solicitar ajuste (colaborador) ── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-sm" onClick={() => !submitting && setIsModalOpen(false)}>
          <div className="flex flex-col bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 w-full max-w-md max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Solicitar ajuste de ponto</h3>
              <button onClick={() => setIsModalOpen(false)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
                <XCircle className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 min-h-0">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Data do ponto</label>
                    <input
                      type="date" required
                      value={form.date}
                      onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Horario correto</label>
                    <input
                      type="time" required
                      value={form.requested_time}
                      onChange={e => setForm(f => ({ ...f, requested_time: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Tipo de ajuste</label>
                  <select
                    value={form.adjustment_type}
                    onChange={e => setForm(f => ({ ...f, adjustment_type: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
                  >
                    <option value="entrada">Entrada</option>
                    <option value="saida">Saida</option>
                    <option value="ambos">Entrada e Saida</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Motivo</label>
                  <textarea
                    required
                    value={form.reason}
                    onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                    placeholder="Descreva o motivo do ajuste..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm min-h-[80px]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">ID do registro (opcional)</label>
                  <input
                    type="text"
                    value={form.time_record_id}
                    onChange={e => setForm(f => ({ ...f, time_record_id: e.target.value }))}
                    placeholder="Cole o ID do registro se souber"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
                  />
                </div>
              </div>
              <div className="flex gap-3 px-5 py-4 border-t border-slate-100 dark:border-slate-800 shrink-0">
                <Button type="button" variant="outline" size="sm" className="flex-1" onClick={() => setIsModalOpen(false)} disabled={submitting}>Cancelar</Button>
                <Button type="submit" size="sm" className="flex-1" disabled={submitting || !form.reason.trim() || !form.date}>
                  {submitting ? "Enviando..." : "Enviar solicitacao"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: rejeitar ── */}
      {rejectTarget && (
        <RejectModal
          onConfirm={handleReject}
          onCancel={() => setRejectTarget(null)}
          busy={busyId === rejectTarget.id}
        />
      )}

      {/* ── Modal: detalhes ── */}
      {detailTarget && (
        <DetailModal
          row={detailTarget}
          userName={usersMap.get(detailTarget.user_id) ?? detailTarget.user_id.slice(0, 8)}
          onClose={() => setDetailTarget(null)}
        />
      )}

      {/* ── Modal: histórico ── */}
      {historyTarget && (
        <AdjustmentHistoryModal
          adjustmentId={historyTarget}
          onClose={() => setHistoryTarget(null)}
        />
      )}
    </div>
  );
};

export default AdjustmentsPage;
