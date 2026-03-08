import { i18n } from '../../lib/i18n';
import type { User } from '../../types';

export interface MenuItemConfig {
  nameKey: string;
  icon: string;
  route: string;
}

/** Menu do administrador: Dashboard, Funcionários, Espelho de Ponto, Monitoramento, Escalas, Horários, Empresa, Relatórios, Configurações */
export const adminMenuItems: MenuItemConfig[] = [
  { nameKey: 'menu.dashboard', icon: 'dashboard', route: '/dashboard' },
  { nameKey: 'menu.employees', icon: 'group', route: '/employees' },
  { nameKey: 'menu.espelhoPonto', icon: 'event_note', route: '/time-records' },
  { nameKey: 'menu.monitoramento', icon: 'insights', route: '/real-time-insights' },
  { nameKey: 'menu.escalas', icon: 'calendar_today', route: '/schedules' },
  { nameKey: 'menu.horarios', icon: 'schedule', route: '/schedules' },
  { nameKey: 'menu.empresa', icon: 'business', route: '/company' },
  { nameKey: 'menu.reports', icon: 'data_usage', route: '/reports' },
  { nameKey: 'menu.settings', icon: 'settings', route: '/settings' },
];

/** Menu do funcionário: Dashboard, Registrar Ponto, Espelho de Ponto, Perfil, Configurações */
export const employeeMenuItems: MenuItemConfig[] = [
  { nameKey: 'menu.dashboard', icon: 'dashboard', route: '/dashboard' },
  { nameKey: 'menu.registrarPonto', icon: 'touch_app', route: '/time-clock' },
  { nameKey: 'menu.espelhoPonto', icon: 'event_note', route: '/time-records' },
  { nameKey: 'menu.perfil', icon: 'person', route: '/profile' },
  { nameKey: 'menu.settings', icon: 'settings', route: '/settings' },
];

/** Retorna os itens do menu conforme o papel do usuário */
export function getMenuItemsForUser(user: User): MenuItemConfig[] {
  const isAdmin = user.role === 'admin' || user.role === 'hr';
  return isAdmin ? adminMenuItems : employeeMenuItems;
}

export function getMenuItemName(item: MenuItemConfig): string {
  return i18n.t(item.nameKey);
}
