import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from '../../components/UI';
import { supabase, isSupabaseConfigured } from '../services/supabaseClient';
import { TIPOS_BATIDA, mapPunchTypeToDb, mapDbToPunchType } from '../constants/punchTypes';
import { localDateAndTimeToIsoUtc } from '../utils/localDateTimeToIso';

const STATUS_TAG_REGEX = /\[STATUS:(FOLGA|FALTA|EXTRA)\]/i;

function parseStatusTypeFromReason(manualReason: string | null | undefined): 'FOLGA' | 'FALTA' | 'EXTRA' | null {
  const m = String(manualReason || '').match(STATUS_TAG_REGEX);
  if (!m) return null;
  return m[1].toUpperCase() as 'FOLGA' | 'FALTA' | 'EXTRA';
}

/** Remove o prefixo [STATUS:…] para editar só o texto livre no formulário. */
function stripStatusTag(manualReason: string): string {
  return String(manualReason || '')
    .replace(/\s*\[STATUS:(FOLGA|FALTA|EXTRA)\]\s*/i, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

interface EditTimeRecordModalProps {
  isOpen: boolean;
  onClose: () => void;
  record: {
    id: string;
    user_id: string;
    created_at: string;
    /** Instante oficial da batida (espelho prioriza sobre created_at). */
    timestamp?: string | null;
    type: string;
    manual_reason?: string | null;
  } | null;
  onSave: () => void;
}

export const EditTimeRecordModal: React.FC<EditTimeRecordModalProps> = ({
  isOpen,
  onClose,
  record,
  onSave,
}) => {
  const [form, setForm] = useState({
    date: '',
    time: '',
    type: 'ENTRADA',
    entry_mode: 'HORARIO' as 'HORARIO' | 'STATUS',
    status_type: 'FOLGA' as 'FOLGA' | 'FALTA' | 'EXTRA',
    manual_reason: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (record && isOpen) {
      const instant = record.timestamp && String(record.timestamp).trim() ? record.timestamp : record.created_at;
      const date = new Date(instant);
      const rawReason = record.manual_reason || '';
      const st = parseStatusTypeFromReason(rawReason);
      if (st) {
        setForm({
          date: date.toISOString().slice(0, 10),
          time: '12:00',
          type: 'ENTRADA',
          entry_mode: 'STATUS',
          status_type: st,
          manual_reason: stripStatusTag(rawReason),
        });
      } else {
        setForm({
          date: date.toISOString().slice(0, 10),
          time: date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false }),
          type: mapDbToPunchType(record.type),
          entry_mode: 'HORARIO',
          status_type: 'FOLGA',
          manual_reason: rawReason,
        });
      }
    }
  }, [record, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!record || !isSupabaseConfigured()) return;

    setSubmitting(true);
    setError(null);

    try {
      const created_at =
        form.entry_mode === 'STATUS'
          ? localDateAndTimeToIsoUtc(form.date, '12:00')
          : localDateAndTimeToIsoUtc(form.date, form.time);

      const statusTag = form.entry_mode === 'STATUS' ? `[STATUS:${form.status_type}]` : '';
      const baseReason = form.manual_reason.trim();
      const manual_reason =
        form.entry_mode === 'STATUS'
          ? [statusTag, baseReason || 'Lançamento de status'].filter(Boolean).join(' ').trim()
          : baseReason || null;

      const { error: updateError } = await supabase
        .from('time_records')
        .update({
          created_at,
          timestamp: created_at,
          updated_at: new Date().toISOString(),
          type: mapPunchTypeToDb(form.entry_mode === 'STATUS' ? 'ENTRADA' : form.type),
          manual_reason,
        })
        .eq('id', record.id);

      if (updateError) throw updateError;

      onSave();
    } catch (err: any) {
      setError(err.message || 'Erro ao atualizar batida');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!record || !isSupabaseConfigured()) return;

    if (!confirm('Tem certeza que deseja excluir esta batida?')) return;

    setSubmitting(true);
    setError(null);

    try {
      const { error: deleteError } = await supabase
        .from('time_records')
        .delete()
        .eq('id', record.id);

      if (deleteError) throw deleteError;

      onSave();
    } catch (err: any) {
      setError(err.message || 'Erro ao excluir batida');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen || !record) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-sm"
      onClick={() => !submitting && onClose()}
    >
      <div
        className="flex flex-col bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">Editar Batida</h3>
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            disabled={submitting}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 min-h-0">
            {error && (
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">
                Tipo de lançamento
              </label>
              <select
                value={form.entry_mode}
                onChange={(e) => {
                  const mode = e.target.value as 'HORARIO' | 'STATUS';
                  setForm((f) => ({
                    ...f,
                    entry_mode: mode,
                    ...(mode === 'STATUS' ? { time: '12:00', type: 'ENTRADA' as const } : {}),
                  }));
                }}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
              >
                <option value="HORARIO">Batida (horário)</option>
                <option value="STATUS">Status (Folga/Falta/Extra)</option>
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">
                  Data
                </label>
                <input
                  type="date"
                  required
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
                />
              </div>
              {form.entry_mode === 'HORARIO' ? (
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">
                    Horário
                  </label>
                  <input
                    type="time"
                    required
                    value={form.time}
                    onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">
                    Status
                  </label>
                  <select
                    value={form.status_type}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        status_type: e.target.value as 'FOLGA' | 'FALTA' | 'EXTRA',
                      }))
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
                  >
                    <option value="FOLGA">Folga</option>
                    <option value="FALTA">Falta</option>
                    <option value="EXTRA">Extra</option>
                  </select>
                </div>
              )}
            </div>

            {form.entry_mode === 'HORARIO' && (
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">
                  Tipo de Batida
                </label>
                <select
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
                >
                  {TIPOS_BATIDA.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">
                Motivo / Observação
              </label>
              <textarea
                value={form.manual_reason}
                onChange={(e) => setForm((f) => ({ ...f, manual_reason: e.target.value }))}
                rows={3}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm resize-none"
              />
            </div>
          </div>

          <div className="shrink-0 border-t border-slate-100 dark:border-slate-800">
            <div className="flex flex-col-reverse sm:flex-row gap-3 px-5 py-4">
              <Button
                type="button"
                variant="danger"
                size="sm"
                className="flex-1"
                onClick={handleDelete}
                disabled={submitting}
              >
                Excluir
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => !submitting && onClose()}
                disabled={submitting}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                className="flex-1"
                disabled={submitting}
              >
                {submitting ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditTimeRecordModal;
