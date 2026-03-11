import React, { useEffect, useState } from 'react';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import PageHeader from '../../components/PageHeader';
import { db, isSupabaseConfigured } from '../../services/supabaseClient';
import { LoadingState } from '../../../components/UI';
import { Building2 } from 'lucide-react';
import { PontoService } from '../../../services/pontoService';
import { firestoreService } from '../../../services/firestoreService';
import type { Company } from '../../../types';

const AdminCompany: React.FC = () => {
  const { user, loading } = useCurrentUser();
  const [form, setForm] = useState({
    name: '',
    cnpj: '',
    address: '',
    phone: '',
    email: '',
    timezone: 'America/Sao_Paulo',
  });
  const [loadingData, setLoadingData] = useState(true);
  const [saving, setSaving] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!user) return;

    // Se o usuário ainda não tem companyId, já libera o formulário para criar a empresa
    if (!user.companyId) {
      setCompanyId(user.id);
      setForm((f) => ({ ...f, name: f.name || 'Nova Empresa' }));
      setLoadingData(false);
      return;
    }

    const load = async () => {
      setLoadingData(true);
      try {
        if (!isSupabaseConfigured) {
          // Fallback quando Supabase não está configurado:
          // usa as informações locais/Firestore via PontoService
          const company = await PontoService.getCompany(user.companyId);
          if (company) {
            setCompanyId(company.id);
            setForm((f) => ({
              ...f,
              name: company.name || f.name || 'Nova Empresa',
            }));
          } else {
            setCompanyId(user.companyId);
            setForm((f) => ({ ...f, name: f.name || 'Nova Empresa' }));
          }
        } else {
          const rows = (await db.select('companies', [
            { column: 'id', operator: 'eq', value: user.companyId },
          ])) as any[];
          if (rows?.[0]) {
            const c = rows[0];
            setCompanyId(c.id);
            setForm({
              name: c.name || c.nome || '',
              cnpj: c.cnpj || '',
              address: c.address || '',
              phone: c.phone || '',
              email: c.email || '',
              timezone: c.timezone || 'America/Sao_Paulo',
            });
          } else {
            setCompanyId(user.companyId);
            setForm((f) => ({ ...f, name: f.name || 'Nova Empresa' }));
          }
        }
      } catch (e) {
        console.error(e);
        setCompanyId(user.companyId || user.id);
      } finally {
        setLoadingData(false);
      }
    };
    load();
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setMessage(null);
    try {
      const idToUse = companyId || user.companyId || user.id;

      if (!isSupabaseConfigured) {
        // Modo desenvolvimento / sem Supabase: salva empresa em localStorage/FireStore via firestoreService
        const existing = await firestoreService.getCompany(idToUse);
        const baseSettings: Company['settings'] =
          (existing as any)?.settings ||
          (await PontoService.getCompany(idToUse))?.settings || {
            fence: { lat: -23.5614, lng: -46.6559, radius: 150 },
            allowManualPunch: true,
            requirePhoto: true,
            standardHours: { start: '09:00', end: '18:00' },
            delayPolicy: { toleranceMinutes: 15 },
          };

        const company: any = {
          id: idToUse,
          nome: form.name || 'Nova Empresa',
          cnpj: form.cnpj || null,
          endereco: form.address || null,
          geofence: baseSettings.fence,
          settings: baseSettings,
          createdAt: (existing as any)?.createdAt || new Date(),
        };

        await firestoreService.saveCompany(company);
        localStorage.setItem(
          `company_${idToUse}`,
          JSON.stringify({
            id: idToUse,
            name: company.nome,
            slug: (company.nome || 'empresa')
              .toLowerCase()
              .replace(/\s+/g, '-')
              .replace(/[^a-z0-9-]/g, ''),
            settings: baseSettings,
          } as Company),
        );
      } else {
        const payload = {
          name: form.name,
          nome: form.name,
          cnpj: form.cnpj || null,
          address: form.address || null,
          phone: form.phone || null,
          email: form.email || null,
          timezone: form.timezone,
          updated_at: new Date().toISOString(),
        };
        try {
          await db.update('companies', idToUse, payload);
        } catch {
          await db.insert('companies', {
            id: idToUse,
            ...payload,
            created_at: new Date().toISOString(),
          });
        }

        // Se o usuário ainda não tinha companyId, vincular agora à empresa criada/atualizada
        if (!user.companyId) {
          try {
            await db.update('users', user.id, { company_id: idToUse });
          } catch (linkErr) {
            console.error('Erro ao vincular usuário à empresa:', linkErr);
          }
          try {
            const stored = localStorage.getItem('current_user');
            if (stored) {
              const parsed = JSON.parse(stored);
              parsed.companyId = idToUse;
              localStorage.setItem('current_user', JSON.stringify(parsed));
            }
          } catch {
            // ignora erro de localStorage
          }
        }
      }
      setMessage({ type: 'success', text: 'Dados da empresa salvos com sucesso.' });
      if (!companyId) setCompanyId(idToUse);
    } catch (e: any) {
      setMessage({ type: 'error', text: e?.message || 'Erro ao salvar.' });
    } finally {
      setSaving(false);
    }
  };

  if (loading || !user) return <LoadingState message="Carregando..." />;

  return (
    <div className="space-y-6">
      <PageHeader title="Empresa" />
      {message && (
        <div className={`p-4 rounded-xl ${message.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'} text-sm`}>
          {message.text}
        </div>
      )}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 overflow-hidden max-w-2xl">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
            <Building2 className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Dados da empresa</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Altere e salve as informações abaixo.</p>
          </div>
        </div>
        {loadingData ? (
          <div className="p-8 text-center text-slate-500">Carregando...</div>
        ) : (
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nome da empresa</label>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">CNPJ</label>
              <input type="text" value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white" placeholder="00.000.000/0000-00" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Endereço</label>
              <input type="text" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Telefone</label>
              <input type="text" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Email</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Timezone</label>
              <select value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white">
                <option value="America/Sao_Paulo">America/São Paulo</option>
                <option value="America/Manaus">America/Manaus</option>
                <option value="America/Fortaleza">America/Fortaleza</option>
                <option value="America/Recife">America/Recife</option>
              </select>
            </div>
            <button type="button" onClick={handleSave} disabled={saving} className="w-full py-3 rounded-xl bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-50">
              Salvar
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminCompany;
