import React from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, ArrowRight } from 'lucide-react';
import type { TenantPlan } from '../../../types';

const UPGRADE_HREF =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_UPGRADE_URL) ||
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_BILLING_URL) ||
  '';

export interface PlanUpgradePanelProps {
  plan: TenantPlan;
  title?: string;
  message: string;
  /** Texto do botão principal; se `externalHref` existir, abre em nova aba. */
  primaryCta?: string;
  externalHref?: string;
  compact?: boolean;
}

/**
 * Painel de upgrade: mensagem clara + botão (interno `/admin/plan` ou URL externa).
 */
export const PlanUpgradePanel: React.FC<PlanUpgradePanelProps> = ({
  plan,
  title = 'Limite do plano',
  message,
  primaryCta = 'Ver planos e upgrade',
  externalHref,
  compact,
}) => {
  const href = (externalHref || UPGRADE_HREF || '').trim();
  const isExternal = /^https?:\/\//i.test(href);

  return (
    <div
      className={
        compact
          ? 'rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50/90 dark:bg-amber-950/30 p-4'
          : 'rounded-2xl border border-amber-200 dark:border-amber-800/60 bg-gradient-to-br from-amber-50 to-orange-50/80 dark:from-amber-950/40 dark:to-slate-900/80 p-6 shadow-sm'
      }
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-10 h-10 rounded-xl bg-amber-500/15 dark:bg-amber-400/10 flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-amber-700 dark:text-amber-300" />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm font-semibold text-amber-950 dark:text-amber-100">{title}</p>
          <p className="text-sm text-amber-900/90 dark:text-amber-100/85 leading-relaxed">{message}</p>
          <p className="text-xs text-amber-800/70 dark:text-amber-200/60">
            Plano atual: <strong className="uppercase">{plan}</strong>
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            {href && isExternal ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
              >
                {primaryCta}
                <ArrowRight className="w-4 h-4" />
              </a>
            ) : (
              <Link
                to="/admin/plan"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
              >
                {primaryCta}
                <ArrowRight className="w-4 h-4" />
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
