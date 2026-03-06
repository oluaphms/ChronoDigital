import { i18n } from '../../lib/i18n';

export interface MenuItemConfig {
  /** Chave de tradução (ex: menu.dashboard) */
  nameKey: string;
  icon: string;
  route: string;
}

export const menuItems: MenuItemConfig[] = [
  { nameKey: 'menu.dashboard', icon: 'dashboard', route: '/dashboard' },
  { nameKey: 'menu.productivityTrends', icon: 'av_timer', route: '/productivity-trends' },
  { nameKey: 'menu.realTimeInsights', icon: 'insights', route: '/real-time-insights' },
  { nameKey: 'menu.alerts', icon: 'notification_important', route: '/alerts' },
  { nameKey: 'menu.employees', icon: 'group', route: '/employees' },
  { nameKey: 'menu.teams', icon: 'groups', route: '/teams' },
  { nameKey: 'menu.screenshots', icon: 'perm_media', route: '/screenshots' },
  { nameKey: 'menu.timeAndAttendance', icon: 'event_note', route: '/time-attendance' },
  { nameKey: 'menu.activities', icon: 'storage', route: '/activities' },
  { nameKey: 'menu.projects', icon: 'work_outline', route: '/projects' },
  { nameKey: 'menu.reports', icon: 'data_usage', route: '/reports' },
  { nameKey: 'menu.settings', icon: 'settings', route: '/settings' },
];

/** Retorna o nome traduzido do item do menu (reage ao idioma atual do i18n) */
export function getMenuItemName(item: MenuItemConfig): string {
  return i18n.t(item.nameKey);
}
