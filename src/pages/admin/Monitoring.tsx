/**
 * Monitoramento unificado: aba Hoje (presença do dia) e aba Mapa (GPS + status recente).
 * Atualização via Supabase Realtime (um canal, debounce).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { db, supabase, isSupabaseConfigured } from '../../services/supabaseClient';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import PageHeader from '../../components/PageHeader';
import MonitoringMap from '../../components/MonitoringMap';
import { LoadingState } from '../../../components/UI';
import {
  MapPin,
  Clock,
  RefreshCw,
  Users,
  LogIn,
  LogOut,
  AlertCircle,
  Zap,
  Calendar,
} from 'lucide-react';

type MapStatus = 'Trabalhando' | 'Em Pausa' | 'Offline' | 'Ausente';

interface EmployeeStatus {
  userId: string;
  userName: string;
  status: MapStatus;
  lastRecordType?: string;
  lastRecordAt?: string;
  lat?: number;
  lng?: number;
}

type UserRow = { id: string; nome: string; email?: string };
type TimeRecordRow = { id: string; user_id: string; type: string; timestamp?: string | null; created_at: string };

type PresenceStatus = 'working' | 'left' | 'late' | 'overtime' | 'absent';

interface EmployeePresence {
  user_id: string;
  nome: string;
  email?: string;
  status: PresenceStatus;
  lastPunch?: string;
  lastType?: string;
  pairCount: number;
}

const todayStart = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};
const todayEnd = () => {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
};

function inferStatus(
  records: TimeRecordRow[],
  now: Date
): { status: PresenceStatus; lastPunch?: string; lastType?: string; pairCount: number } {
  const sorted = [...records].sort(
    (a, b) => new Date(a.timestamp || a.created_at).getTime() - new Date(b.timestamp || b.created_at).getTime()
  );
  const last = sorted[sorted.length - 1];
  const type = (t: string) => (t || '').toLowerCase().replace('saída', 'saida').replace('saida', 'saida');
  let entradas = 0;
  let saidas = 0;
  for (const r of sorted) {
    const t = type(r.type);
    if (t === 'entrada') entradas++;
    if (t === 'saida') saidas++;
  }
  const pairCount = Math.min(entradas, saidas);
  const lastType = last ? type(last.type) : null;
  const lastTs = last ? last.timestamp || last.created_at : null;

  if (sorted.length === 0) {
    const hour = now.getHours();
    const min = now.getMinutes();
    if (hour < 8) return { status: 'absent', pairCount: 0 };
    if (hour > 8 || (hour === 8 && min > 30)) return { status: 'late', pairCount: 0 };
    return { status: 'absent', pairCount: 0 };
  }
  if (lastType === 'entrada') {
    const h = now.getHours();
    if (h >= 18) return { status: 'overtime', lastPunch: lastTs ?? undefined, lastType: last.type, pairCount };
    return { status: 'working', lastPunch: lastTs ?? undefined, lastType: last.type, pairCount };
  }
  if (lastType === 'saida') {
    return { status: 'left', lastPunch: lastTs ?? undefined, lastType: last.type, pairCount };
  }
  return { status: 'working', lastPunch: lastTs ?? undefined, lastType: last?.type, pairCount };
}

type TabId = 'hoje' | 'mapa';

const AdminMonitoring: React.FC = () => {
  const { user, loading } = useCurrentUser();
  const [tab, setTab] = useState<TabId>('hoje');
  const [loadingData, setLoadingData] = useState(true);
  const [mapList, setMapList] = useState<EmployeeStatus[]>([]);
  const [todayUsers, setTodayUsers] = useState<UserRow[]>([]);
  const [todayRecords, setTodayRecords] = useState<TimeRecordRow[]>([]);

  const refresh = useCallback(async () => {
    if (!user?.companyId || !isSupabaseConfigured) return;
    setLoadingData(true);
    try {
      const start = todayStart();
      const end = todayEnd();
      const [usersRows, recentRecords, recordListToday] = await Promise.all([
        db.select('users', [{ column: 'company_id', operator: 'eq', value: user.companyId }], { column: 'nome', ascending: true }, 500) as Promise<UserRow[]>,
        db.select('time_records', [{ column: 'company_id', operator: 'eq', value: user.companyId }], { column: 'created_at', ascending: false }, 500) as Promise<TimeRecordRow[]>,
        db.select(
          'time_records',
          [
            { column: 'company_id', operator: 'eq', value: user.companyId },
            { column: 'created_at', operator: 'gte', value: start },
            { column: 'created_at', operator: 'lte', value: end },
          ],
          { column: 'created_at', ascending: true },
          2000
        ) as Promise<TimeRecordRow[]>,
      ]);
      const users = usersRows ?? [];
      const records = recentRecords ?? [];
      const lastByUser = new Map<string, { type: string; at: string; location?: { lat?: number; lng?: number } }>();
      records.forEach((r: TimeRecordRow) => {
        if (!lastByUser.has(r.user_id)) {
          lastByUser.set(r.user_id, {
            type: r.type,
            at: r.created_at,
            location: (r as { location?: { lat?: number; lng?: number } }).location,
          });
        }
      });
      const statusList: EmployeeStatus[] = users.map((u: UserRow) => {
        const last = lastByUser.get(u.id);
        let status: MapStatus = 'Offline';
        if (last) {
          const dt = new Date(last.at).getTime();
          const now = Date.now();
          const diffMin = (now - dt) / 60000;
          if (diffMin > 60) status = 'Ausente';
          else if (last.type === 'entrada') status = 'Trabalhando';
          else if (last.type === 'pausa') status = 'Em Pausa';
          else status = 'Offline';
        }
        return {
          userId: u.id,
          userName: u.nome || u.email || '—',
          status,
          lastRecordType: last?.type,
          lastRecordAt: last?.at ? new Date(last.at).toLocaleString('pt-BR') : undefined,
          lat: last?.location?.lat,
          lng: last?.location?.lng,
        };
      });
      setMapList(statusList);
      setTodayUsers(users);
      setTodayRecords(recordListToday ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingData(false);
    }
  }, [user?.companyId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!supabase || !user?.companyId) return;
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel('admin_monitoring_unified')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'time_records', filter: `company_id=eq.${user.companyId}` }, () => {
        if (debounce) clearTimeout(debounce);
        debounce = setTimeout(() => {
          debounce = null;
          void refresh();
        }, 400);
      })
      .subscribe();
    return () => {
      if (debounce) clearTimeout(debounce);
      void supabase.removeChannel(channel);
    };
  }, [user?.companyId, refresh]);

  const byUser = useMemo(() => {
    const map = new Map<string, TimeRecordRow[]>();
    for (const r of todayRecords) {
      const list = map.get(r.user_id) || [];
      list.push(r);
      map.set(r.user_id, list);
    }
    return map;
  }, [todayRecords]);

  const presenceList = useMemo(() => {
    const now = new Date();
    const result: EmployeePresence[] = [];
    for (const u of todayUsers) {
      const recs = byUser.get(u.id) || [];
      const { status, lastPunch, lastType, pairCount } = inferStatus(recs, now);
      result.push({
        user_id: u.id,
        nome: u.nome || u.email || u.id.slice(0, 8),
        email: u.email,
        status,
        lastPunch,
        lastType,
        pairCount,
      });
    }
    return result.sort((a, b) => a.nome.localeCompare(b.nome));
  }, [todayUsers, byUser]);

  const working = presenceList.filter((e) => e.status === 'working');
  const left = presenceList.filter((e) => e.status === 'left');
  const late = presenceList.filter((e) => e.status === 'late');
  const overtime = presenceList.filter((e) => e.status === 'overtime');
  const absent = presenceList.filter((e) => e.status === 'absent');

  const formatTime = (s: string | undefined) => {
    if (!s) return '—';
    try {
      return new Date(s).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return s;
    }
  };

  if (loading) return <LoadingState message="Carregando..." />;
  if (!user) return <Navigate to="/" replace />;

  const statusColor: Record<MapStatus, string> = {
    Trabalhando: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
    'Em Pausa': 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    Offline: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
    Ausente: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  };

  const tabBtn = (id: TabId, label: string, icon: React.ReactNode) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === id}
      onClick={() => setTab(id)}
      className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
        tab === id
          ? 'bg-indigo-600 text-white shadow-md'
          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
      }`}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <PageHeader
          title="Monitoramento"
          subtitle="Presença do dia, mapa e status em tempo real. Atualização automática."
          icon={<Users size={24} />}
        />
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loadingData}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 font-medium disabled:opacity-50 shrink-0"
        >
          <RefreshCw className={`w-5 h-5 ${loadingData ? 'animate-spin' : ''}`} /> Atualizar
        </button>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Visões de monitoramento">
        {tabBtn('hoje', 'Hoje', <Calendar className="w-4 h-4" />)}
        {tabBtn('mapa', 'Mapa', <MapPin className="w-4 h-4" />)}
      </div>

      {loadingData ? (
        <LoadingState message="Carregando..." />
      ) : (
        <>
          {tab === 'hoje' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <StatCard icon={<LogIn className="text-green-600" size={20} />} label="Trabalhando agora" value={working.length} />
                <StatCard icon={<LogOut className="text-slate-600" size={20} />} label="Já saíram" value={left.length} />
                <StatCard icon={<AlertCircle className="text-amber-600" size={20} />} label="Atrasados" value={late.length} />
                <StatCard icon={<Zap className="text-indigo-600" size={20} />} label="Em hora extra" value={overtime.length} />
                <StatCard icon={<Clock className="text-red-600" size={20} />} label="Faltas hoje" value={absent.length} />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <PresenceSection title="Trabalhando agora" items={working} formatTime={formatTime} statusLabel="Entrada" />
                <PresenceSection title="Já saíram" items={left} formatTime={formatTime} statusLabel="Última saída" />
                <PresenceSection title="Atrasados" items={late} formatTime={formatTime} statusLabel="—" />
                <PresenceSection title="Em hora extra" items={overtime} formatTime={formatTime} statusLabel="Entrada" />
                <PresenceSection title="Faltas hoje" items={absent} formatTime={formatTime} statusLabel="—" />
              </div>
            </div>
          )}

          {tab === 'mapa' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Status com base no último registro recente. Mapa: localização do último ponto com GPS.
              </p>
              <div className="space-y-2">
                <h2 className="text-base font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-indigo-500" />
                  Mapa em tempo real
                </h2>
                <MonitoringMap employees={mapList} height="420px" className="w-full" />
              </div>
              <h2 className="text-base font-semibold text-slate-800 dark:text-slate-200 pt-2">Lista por status</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {mapList.map((emp) => (
                  <div
                    key={emp.userId}
                    className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 p-5 flex flex-col gap-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 dark:text-white truncate">{emp.userName}</span>
                      <span className={`px-2.5 py-1 rounded-lg text-xs font-medium shrink-0 ${statusColor[emp.status]}`}>
                        {emp.status}
                      </span>
                    </div>
                    {emp.lastRecordAt && (
                      <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                        <Clock className="w-4 h-4 shrink-0" />
                        <span>Último registro: {emp.lastRecordAt}</span>
                      </div>
                    )}
                    {emp.lastRecordType && (
                      <p className="text-xs text-slate-500 dark:text-slate-400">Tipo: {emp.lastRecordType}</p>
                    )}
                    {emp.lat != null && emp.lng != null && (
                      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <MapPin className="w-4 h-4 shrink-0" />
                        <span>
                          Lat {Number(emp.lat).toFixed(4)}, Lng {Number(emp.lng).toFixed(4)}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {mapList.length === 0 && (
                <p className="text-center text-slate-500 dark:text-slate-400 py-8">Nenhum funcionário na empresa.</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 bg-white dark:bg-slate-800 flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center">{icon}</div>
      <div>
        <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
        <p className="text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
      </div>
    </div>
  );
}

function PresenceSection({
  title,
  items,
  formatTime,
  statusLabel,
}: {
  title: string;
  items: EmployeePresence[];
  formatTime: (s: string | undefined) => string;
  statusLabel: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
      <h3 className="px-4 py-3 font-semibold text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-800/50">
        {title} ({items.length})
      </h3>
      <ul className="divide-y divide-slate-200 dark:divide-slate-700 max-h-72 overflow-y-auto">
        {items.length === 0 ? (
          <li className="px-4 py-6 text-center text-slate-500 dark:text-slate-400 text-sm">Nenhum</li>
        ) : (
          items.map((e) => (
            <li key={e.user_id} className="px-4 py-2 flex justify-between items-center">
              <span className="font-medium text-slate-900 dark:text-white truncate">{e.nome}</span>
              {statusLabel !== '—' && <span className="text-sm text-slate-500 dark:text-slate-400">{formatTime(e.lastPunch)}</span>}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

export default AdminMonitoring;
