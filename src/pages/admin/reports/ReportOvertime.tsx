import React, { useEffect, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { useCurrentUser } from '../../../hooks/useCurrentUser';
import PageHeader from '../../../components/PageHeader';
import { db, isSupabaseConfigured } from '../../../services/supabaseClient';
import { processEmployeeMonth } from '../../../engine/timeEngine';
import { LoadingState } from '../../../../components/UI';

interface Row {
  employeeId: string;
  employeeName: string;
  overtime50: number;
  overtime100: number;
  total: number;
}

const ReportOvertime: React.FC = () => {
  const { user, loading } = useCurrentUser();
  const [employees, setEmployees] = useState<{ id: string; nome: string }[]>([]);
  const [month, setMonth] = useState(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
  });
  const [rows, setRows] = useState<Row[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  useEffect(() => {
    if (!user?.companyId || !isSupabaseConfigured) return;
    (async () => {
      const list = (await db.select('users', [{ column: 'company_id', operator: 'eq', value: user.companyId }])) as any[];
      setEmployees((list ?? []).map((u: any) => ({ id: u.id, nome: u.nome || u.email })));
    })();
  }, [user?.companyId]);

  useEffect(() => {
    if (!user?.companyId || !isSupabaseConfigured || employees.length === 0) return;
    const [y, m] = month.split('-').map(Number);
    setLoadingData(true);
    (async () => {
      const result: Row[] = [];
      for (const emp of employees.slice(0, 100)) {
        try {
          const days = await processEmployeeMonth(emp.id, user!.companyId!, y, m);
          let overtime50 = 0;
          let overtime100 = 0;
          days.forEach((d) => {
            if (d.overtime) {
              overtime50 += d.overtime.overtime_50_minutes / 60;
              overtime100 += d.overtime.overtime_100_minutes / 60;
            }
          });
          result.push({
            employeeId: emp.id,
            employeeName: emp.nome,
            overtime50,
            overtime100,
            total: overtime50 + overtime100,
          });
        } catch {
          result.push({ employeeId: emp.id, employeeName: emp.nome, overtime50: 0, overtime100: 0, total: 0 });
        }
      }
      setRows(result);
      setLoadingData(false);
    })();
  }, [user?.companyId, month, employees]);

  if (loading || !user) return <LoadingState message="Carregando..." />;

  return (
    <div className="space-y-6">
      <PageHeader title="Relatório de Horas Extras" subtitle="50% e 100% por funcionário" icon={<TrendingUp className="w-5 h-5" />} />
      <div className="flex flex-wrap gap-4 items-end">
        <label className="block">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Mês</span>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="ml-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800" />
        </label>
      </div>
      {loadingData ? (
        <LoadingState message="Calculando horas extras..." />
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                <th className="text-left px-4 py-3 font-bold text-slate-500 dark:text-slate-400">Funcionário</th>
                <th className="text-right px-4 py-3 font-bold text-slate-500 dark:text-slate-400">HE 50% (h)</th>
                <th className="text-right px-4 py-3 font-bold text-slate-500 dark:text-slate-400">HE 100% (h)</th>
                <th className="text-right px-4 py-3 font-bold text-slate-500 dark:text-slate-400">Total (h)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.employeeId} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="px-4 py-3">{r.employeeName}</td>
                  <td className="text-right px-4 py-3 tabular-nums">{r.overtime50.toFixed(2)}</td>
                  <td className="text-right px-4 py-3 tabular-nums">{r.overtime100.toFixed(2)}</td>
                  <td className="text-right px-4 py-3 tabular-nums font-medium">{r.total.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ReportOvertime;
