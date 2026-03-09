import React, { memo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, LogOut } from 'lucide-react';
import {
  getBottomNavPrimaryItems,
  getMoreMenuItems,
  getNavigationForRole,
} from '../../config/navigation';
import type { User } from '../../../types';

export interface BottomNavProps {
  user: User;
  onLogout: () => void;
}

const BottomNav: React.FC<BottomNavProps> = ({ user, onLogout }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const primaryItems = getBottomNavPrimaryItems(user?.role ?? 'employee');
  const moreItems = getMoreMenuItems(user?.role ?? 'employee');

  return (
    <>
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 lg:hidden flex items-center justify-around bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-t border-slate-200 dark:border-slate-800 safe-area-pb"
        aria-label="Navegação principal"
      >
        {primaryItems.map((item) => {
          const isActive = location.pathname === item.path;
          const Icon = item.icon;
          return (
            <button
              key={item.path}
              type="button"
              onClick={() => navigate(item.path)}
              className={`flex flex-col items-center justify-center flex-1 py-2.5 px-2 min-w-0 gap-1 transition-colors ${
                isActive
                  ? 'text-indigo-600 dark:text-indigo-400'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
              aria-current={isActive ? 'page' : undefined}
              aria-label={item.name}
            >
              <Icon size={24} aria-hidden />
              <span className="text-[10px] font-medium truncate max-w-full">{item.name}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className={`flex flex-col items-center justify-center flex-1 py-2.5 px-2 min-w-0 gap-1 transition-colors ${
            drawerOpen
              ? 'text-indigo-600 dark:text-indigo-400'
              : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
          aria-label="Mais opções"
          aria-expanded={drawerOpen}
        >
          <Menu size={24} aria-hidden />
          <span className="text-[10px] font-medium">Mais</span>
        </button>
      </nav>

      {/* Drawer "Mais" */}
      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setDrawerOpen(false)}
              aria-hidden
            />
            <motion.aside
              className="fixed bottom-0 left-0 right-0 z-50 lg:hidden rounded-t-2xl bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 shadow-2xl max-h-[70vh] flex flex-col"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'tween', duration: 0.25, ease: 'easeOut' }}
              aria-label="Menu Mais"
            >
              <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">Mais</h2>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                  aria-label="Fechar"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="overflow-y-auto flex-1 p-4 flex flex-col gap-1">
                {moreItems.map((item) => {
                  const isActive = location.pathname === item.path;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.path}
                      type="button"
                      onClick={() => {
                        navigate(item.path);
                        setDrawerOpen(false);
                      }}
                      className={`
                        flex items-center gap-3 w-full rounded-xl px-4 py-3 text-left text-sm font-medium transition-colors
                        ${
                          isActive
                            ? 'bg-indigo-600 text-white'
                            : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }
                      `}
                    >
                      <Icon size={20} aria-hidden />
                      {item.name}
                    </button>
                  );
                })}
              </div>
              <div className="p-4 pt-0 mt-auto border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setDrawerOpen(false);
                    onLogout();
                  }}
                  className="flex items-center gap-3 w-full rounded-xl px-4 py-3 text-left text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                  aria-label="Sair do sistema"
                >
                  <LogOut size={20} aria-hidden />
                  Sair do sistema
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
};

export default memo(BottomNav);
