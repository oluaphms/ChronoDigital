import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, CalendarDays, Activity } from 'lucide-react';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import PageHeader from '../../components/PageHeader';
import { db, isSupabaseConfigured } from '../../services/supabaseClient';
import { LoadingState } from '../../../components/UI';
import { calculateWorkedHours } from '../../utils/timeCalculations';
import { LogType, PunchMethod } from '../../../types';
import type { TimeRecord } from '../../../types';

const EmployeeDashboard: React.FC = () => {
  const { user, loading } = useCurrentUser();
  const navigate = useNavigate();
  const [lastRecord, setLastRecord] = useState<{ type: string; created_at: string } | null>(null);
  const [todayRecords, setTodayRecords] = useState<any[]>([]);
  const [todayHours, setTodayHours] = useState('');
  const [scheduleName, setScheduleName] = useState<string>('—');
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (!user || !isSupabaseConfigured) return;
    const load = async () => {
      setLoadingData(true);
      try {
        const rows = (await db.select('time_records', [{ column: 'user_id', operator: 'eq', value: user.id }], { column: 'created_at', ascending: false }, 50)) as any[];
        const today = new Date().toISOString().slice(0, 10);
        const todayList = (rows ?? []).filter((r: any) => (r.created_at || '').slice(0, 10) === today);
        setTodayRecords(todayList);
        if (todayList.length > 0) {
          setLastRecord({ type: todayList[0].type, created_at: todayList[0].created_at });
          const today = new Date();
          const mapped: TimeRecord[] = todayList.map((r: any) => ({
            id: r.id,
            userId: r.user_id,
            companyId: r.company_id,
            type: r.type === 'entrada' ? LogType.IN : r.type === 'saída' ? LogType.OUT : LogType.BREAK,
            method: (r.method as PunchMethod) || PunchMethod.GPS,
            createdAt: new Date(r.created_at),
            ipAddress: '',
            deviceId: '',
            deviceInfo: { browser: '', os: '', isMobile: false, userAgent: '' },
          }));
          const worked = calculateWorkedHours(mapped, today);
          const h = Math.floor(worked);
          const m = Math.round((worked % 1) * 60);
          setTodayHours(`${h}h ${m}m`);
        } else if ((rows ?? []).length > 0) {
          setLastRecord({ type: rows[0].type, created_at: rows[0].created_at });
        } else {
          setLastRecord(null);
        }
        if (user.schedule_id) {
          try {
            const sched = (await db.select('schedules', [{ column: 'id', operator: 'eq', value: user.schedule_id }])) as any[];
            if (sched?.[0]) setScheduleName(sched[0].name || '—');
          } catch {
            setScheduleName('—');
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingData(false);
      }
    };
    load();
  }, [user?.id, user?.schedule_id]);

  const statusLabel = lastRecord?.type === 'entrada' ? 'Trabalhando' : lastRecord?.type === 'pausa' ? 'Em pausa' : 'Fora do expediente';

  if (loading || !user) return <LoadingState message="Carregando..." />;

  return (
    <div className="space-y-8">
      <PageHeader title="Dashboard" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 p-6 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-500 flex items-center justify-center text-white">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status atual</p>
            <p className="text-lg font-bold text-slate-900 dark:text-white">{statusLabel}</p>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 p-6 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-500 flex items-center justify-center text-white">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Último registro</p>
            <p className="text-lg font-bold text-slate-900 dark:text-white tabular-nums">
              {lastRecord ? new Date(lastRecord.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'}
            </p>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 p-6 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-500 flex items-center justify-center text-white">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Horas trabalhadas hoje</p>
            <p className="text-lg font-bold text-slate-900 dark:text-white tabular-nums">{todayHours || '0h 0m'}</p>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 p-6 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-500 flex items-center justify-center text-white">
            <CalendarDays className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Escala do dia</p>
            <p className="text-lg font-bold text-slate-900 dark:text-white">{scheduleName}</p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Hoje</h3>
          <button type="button" onClick={() => navigate('/employee/clock')} className="text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:underline">
            Registrar Ponto
          </button>
        </div>
        <ul className="space-y-2">
          {todayRecords.length === 0 && !loadingData && <li className="text-slate-500 dark:text-slate-400 text-sm">Nenhum registro hoje.</li>}
          {todayRecords.map((r: any) => (
            <li key={r.id} className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
              <span className="font-medium text-slate-900 dark:text-white capitalize">{r.type}</span>
              <span className="tabular-nums text-slate-600 dark:text-slate-300">
                {new Date(r.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default EmployeeDashboard;
