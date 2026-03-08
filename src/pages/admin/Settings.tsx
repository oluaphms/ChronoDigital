import React, { useEffect, useState } from 'react';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import PageHeader from '../../components/PageHeader';
import { db, isSupabaseConfigured } from '../../services/supabaseClient';
import { LoadingState } from '../../../components/UI';

const KEYS = {
  gps_required: 'gps_required',
  photo_required: 'photo_required',
  tolerance_minutes: 'tolerance_minutes',
  min_break_minutes: 'min_break_minutes',
} as const;

const AdminSettings: React.FC = () => {
  const { user, loading } = useCurrentUser();
  const [form, setForm] = useState({
    gps_required: true,
    photo_required: true,
    tolerance_minutes: 15,
    min_break_minutes: 60,
  });
  const [idsByKey, setIdsByKey] = useState<Record<string, string>>({});
  const [loadingData, setLoadingData] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!user?.companyId || !isSupabaseConfigured) return;
    const load = async () => {
      setLoadingData(true);
      try {
        const rows = (await db.select('system_settings', [{ column: 'company_id', operator: 'eq', value: user.companyId }])) as any[];
        const map = new Map((rows ?? []).map((r: any) => [r.key, r.value]));
        const ids: Record<string, string> = {};
        (rows ?? []).forEach((r: any) => { ids[r.key] = r.id; });
        setIdsByKey(ids);
        setForm({
          gps_required: map.get(KEYS.gps_required)?.enabled ?? true,
          photo_required: map.get(KEYS.photo_required)?.enabled ?? true,
          tolerance_minutes: map.get(KEYS.tolerance_minutes)?.minutes ?? 15,
          min_break_minutes: map.get(KEYS.min_break_minutes)?.minutes ?? 60,
        });
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingData(false);
      }
    };
    load();
  }, [user?.companyId]);

  const handleSave = async () => {
    if (!user?.companyId || !isSupabaseConfigured) return;
    setSaving(true);
    setMessage(null);
    try {
      const pairs: { key: string; value: object }[] = [
        { key: KEYS.gps_required, value: { enabled: form.gps_required } },
        { key: KEYS.photo_required, value: { enabled: form.photo_required } },
        { key: KEYS.tolerance_minutes, value: { minutes: form.tolerance_minutes } },
        { key: KEYS.min_break_minutes, value: { minutes: form.min_break_minutes } },
      ];
      for (const { key, value } of pairs) {
        const id = idsByKey[key];
        if (id) {
          await db.update('system_settings', id, { value });
        } else {
          await db.insert('system_settings', {
            id: crypto.randomUUID(),
            company_id: user.companyId,
            key,
            value,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }
      }
      setMessage({ type: 'success', text: 'Configurações salvas com sucesso.' });
    } catch (e: any) {
      setMessage({ type: 'error', text: e?.message || 'Erro ao salvar.' });
    } finally {
      setSaving(false);
    }
  };

  if (loading || !user) return <LoadingState message="Carregando..." />;

  return (
    <div className="space-y-6">
      <PageHeader title="Configurações" />
      {message && (
        <div className={`p-4 rounded-xl ${message.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'} text-sm`}>
          {message.text}
        </div>
      )}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 overflow-hidden max-w-xl">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Configurações do sistema</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Defina regras globais para registro de ponto.</p>
        </div>
        {loadingData ? (
          <div className="p-8 text-center text-slate-500">Carregando...</div>
        ) : (
          <div className="p-6 space-y-6">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={form.gps_required} onChange={(e) => setForm({ ...form, gps_required: e.target.checked })} className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
              <span className="text-slate-900 dark:text-white font-medium">GPS obrigatório</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={form.photo_required} onChange={(e) => setForm({ ...form, photo_required: e.target.checked })} className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
              <span className="text-slate-900 dark:text-white font-medium">Registro com foto obrigatório</span>
            </label>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Tolerância de atraso (minutos)</label>
              <input type="number" min={0} value={form.tolerance_minutes} onChange={(e) => setForm({ ...form, tolerance_minutes: Number(e.target.value) })} className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Tempo mínimo de intervalo (minutos)</label>
              <input type="number" min={0} value={form.min_break_minutes} onChange={(e) => setForm({ ...form, min_break_minutes: Number(e.target.value) })} className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white" />
            </div>
            <button type="button" onClick={handleSave} disabled={saving} className="w-full py-3 rounded-xl bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-50">
              Salvar Configurações
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminSettings;
