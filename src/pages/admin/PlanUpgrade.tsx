import React from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import PageHeader from '../../components/PageHeader';
import { LoadingState } from '../../../components/UI';
import RoleGuard from '../../components/auth/RoleGuard';
import { Check, Mail } from 'lucide-react';
import { useTenantPlan } from '../../hooks/useTenantPlan';

const UPGRADE_CONTACT =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SALES_EMAIL) || 'comercial@seudominio.com.br';

const EXTERNAL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_UPGRADE_URL) ||
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_BILLING_URL) ||
  '';

export default function AdminPlanUpgrade() {
  const { user, loading } = useCurrentUser();
  const { plan, maxEmployees, employeeCount, loading: planLoading } = useTenantPlan(user?.companyId);

  if (loading || planLoading) return <LoadingState message="Carregando plano…" />;
  if (!user) return <Navigate to="/" replace />;

  return (
    <RoleGuard user={user} allowedRoles={['admin', 'hr']}>
      <div className="space-y-8 max-w-3xl">
        <PageHeader
          title="Plano da empresa"
          subtitle="Limites por plano e opções de upgrade. O plano impacta quantos colaboradores ativos você pode manter e o acesso a recursos avançados (REP, fiscalização)."
        />

        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 p-6 space-y-2">
          <p className="text-sm text-slate-600 dark:text-slate-400">Resumo da sua empresa</p>
          <p className="text-lg font-semibold text-slate-900 dark:text-white">
            Plano: <span className="uppercase text-indigo-600 dark:text-indigo-400">{plan}</span>
          </p>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Colaboradores ativos (contagem para limite):{' '}
            <strong className="text-slate-900 dark:text-white">{employeeCount}</strong>
            {maxEmployees != null ? (
              <>
                {' '}
                / <strong>{maxEmployees}</strong> no plano atual
              </>
            ) : (
              <span> (ilimitado)</span>
            )}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {[
            {
              name: 'Free',
              key: 'free' as const,
              price: 'Grátis',
              seats: 'Até 5 colaboradores',
              feats: ['Espelho de ponto', 'Registro web', 'Sem importação AFD / fiscalização REP'],
            },
            {
              name: 'Pro',
              key: 'pro' as const,
              price: 'Consulte vendas',
              seats: 'Até 50 colaboradores',
              feats: ['Tudo do Free', 'Importação AFD', 'Fiscalização REP-P', 'Integrações REP'],
            },
            {
              name: 'Enterprise',
              key: 'enterprise' as const,
              price: 'Sob consulta',
              seats: 'Colaboradores ilimitados',
              feats: ['Tudo do Pro', 'Prioridade de suporte', 'Customizações'],
            },
          ].map((tier) => (
            <div
              key={tier.key}
              className={`rounded-2xl border p-5 flex flex-col ${
                plan === tier.key
                  ? 'border-indigo-500 ring-2 ring-indigo-500/20 bg-indigo-50/40 dark:bg-indigo-950/20'
                  : 'border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/40'
              }`}
            >
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{tier.name}</p>
              <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">{tier.price}</p>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">{tier.seats}</p>
              <ul className="mt-4 space-y-2 text-sm text-slate-700 dark:text-slate-300 flex-1">
                {tier.feats.map((f) => (
                  <li key={f} className="flex gap-2">
                    <Check className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-6 space-y-4">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">Solicitar upgrade</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            A alteração do plano no banco pode ser feita pela equipa comercial ou pelo administrador da plataforma após
            contratação. Enquanto isso, use o contacto abaixo ou o link externo configurado na aplicação.
          </p>
          <div className="flex flex-wrap gap-3">
            <a
              href={`mailto:${UPGRADE_CONTACT}?subject=${encodeURIComponent('Upgrade de plano — SmartPonto')}`}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
            >
              <Mail className="w-4 h-4" />
              Escrever para {UPGRADE_CONTACT}
            </a>
            {EXTERNAL && /^https?:\/\//i.test(EXTERNAL) && (
              <a
                href={EXTERNAL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 text-sm font-medium text-slate-800 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800"
              >
                Portal de faturação
              </a>
            )}
            <Link
              to="/admin/employees"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              Voltar a colaboradores
            </Link>
          </div>
        </div>
      </div>
    </RoleGuard>
  );
}
