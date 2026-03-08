import React, { useEffect, useState } from 'react';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import PageHeader from '../../components/PageHeader';
import { db, isSupabaseConfigured } from '../../services/supabaseClient';
import { LoadingState } from '../../../components/UI';
import { auth } from '../../services/supabaseClient';

const EmployeeSettings: React.FC = () => {
  const { user, loading } = useCurrentUser();
  const [language, setLanguage] = useState('pt-BR');
  const [notifications, setNotifications] = useState(true);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!user) return;
    setLanguage(user.preferences?.language ?? 'pt-BR');
    setNotifications(user.preferences?.notifications ?? true);
  }, [user]);

  const handleSaveSettings = async () => {
    if (!user || !isSupabaseConfigured) return;
    setSaving(true);
    setMessage(null);
    try {
      const prefs = { language, notifications };
      await db.update('users', user.id, {
        preferences: { ...user.preferences, ...prefs },
        updated_at: new Date().toISOString(),
      });
      const existing = (await db.select('user_settings', [
        { column: 'user_id', operator: 'eq', value: user.id },
        { column: 'key', operator: 'eq', value: 'preferences' },
      ])) as any[];
      const row = existing?.[0];
      const value = prefs;
      if (row) {
        await db.update('user_settings', row.id, { value, updated_at: new Date().toISOString() });
      } else {
        await db.insert('user_settings', {
          id: crypto.randomUUID(),
          user_id: user.id,
          key: 'preferences',
          value,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
      setMessage({ type: 'success', text: 'Preferências salvas.' });
    } catch (e) {
      setMessage({ type: 'error', text: 'Erro ao salvar.' });
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!newPassword || newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'Senhas não conferem ou vazias.' });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      await auth.updatePassword(newPassword);
      setNewPassword('');
      setConfirmPassword('');
      setMessage({ type: 'success', text: 'Senha alterada com sucesso.' });
    } catch (e: any) {
      setMessage({ type: 'error', text: e?.message || 'Erro ao alterar senha.' });
    } finally {
      setSaving(false);
    }
  };

  if (loading || !user) return <LoadingState message="Carregando..." />;

  return (
    <div className="space-y-8">
      <PageHeader title="Configurações" />

      {message && (
        <div className={`p-4 rounded-xl ${message.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'}`}>
          {message.text}
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 overflow-hidden max-w-xl">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Alterar senha</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Defina uma nova senha de acesso.</p>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nova senha</label>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white" placeholder="••••••••" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Confirmar senha</label>
            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white" placeholder="••••••••" />
          </div>
          <button type="button" onClick={handleChangePassword} disabled={saving} className="w-full py-2.5 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white font-medium hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-50">
            Alterar senha
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 overflow-hidden max-w-xl">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Idioma e notificações</h2>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Idioma</label>
            <select value={language} onChange={(e) => setLanguage(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white">
              <option value="pt-BR">Português</option>
              <option value="en-US">English</option>
            </select>
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={notifications} onChange={(e) => setNotifications(e.target.checked)} className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
            <span className="text-slate-900 dark:text-white font-medium">Notificações</span>
          </label>
          <button type="button" onClick={handleSaveSettings} disabled={saving} className="w-full py-2.5 rounded-xl bg-emerald-600 text-white font-medium hover:bg-emerald-700 disabled:opacity-50">
            Salvar configurações
          </button>
        </div>
      </div>
    </div>
  );
};

export default EmployeeSettings;
