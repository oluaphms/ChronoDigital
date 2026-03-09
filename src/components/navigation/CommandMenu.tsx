import React, { memo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Command } from 'cmdk';
import { motion, AnimatePresence } from 'framer-motion';
import { getNavigationForRole } from '../../config/navigation';
import type { User } from '../../../types';

export interface CommandMenuProps {
  user: User;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CommandMenu: React.FC<CommandMenuProps> = ({ user, open, onOpenChange }) => {
  const navigate = useNavigate();
  const items = getNavigationForRole(user?.role ?? 'employee');

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onOpenChange(false);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        onOpenChange((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onOpenChange]);

  const handleSelect = useCallback(
    (path: string) => {
      navigate(path);
      onOpenChange(false);
    },
    [navigate, onOpenChange]
  );

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => onOpenChange(false)}
            aria-hidden
          />
          <motion.div
            className="fixed left-1/2 top-[15%] z-[101] w-full max-w-lg -translate-x-1/2 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={{ type: 'tween', duration: 0.2, ease: 'easeOut' }}
            role="dialog"
            aria-label="Busca e navegação"
          >
            <Command
              className="[&_[cmdk-input]]:h-12 [&_[cmdk-input]]:px-4 [&_[cmdk-input]]:text-base [&_[cmdk-input]]:border-0 [&_[cmdk-input]]:border-b [&_[cmdk-input]]:border-slate-100 [&_[cmdk-input]]:dark:border-slate-800 [&_[cmdk-input]]:rounded-none [&_[cmdk-group-heading]]:px-4 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:text-slate-400 [&_[cmdk-group-heading]]:uppercase [&_[cmdk-item]]:px-4 [&_[cmdk-item]]:py-3 [&_[cmdk-item]]:rounded-lg [&_[cmdk-item][aria-selected=true]]:bg-indigo-600 [&_[cmdk-item][aria-selected=true]]:text-white [&_[cmdk-list]]:max-h-[min(60vh,400px)] [&_[cmdk-list]]:overflow-auto"
              label="Busca e navegação"
            >
              <Command.Input
                placeholder="Buscar página ou ação..."
                autoFocus
                className="outline-none bg-transparent text-slate-900 dark:text-white placeholder:text-slate-400"
              />
              <Command.List>
                <Command.Empty className="py-8 text-center text-slate-500 dark:text-slate-400 text-sm">
                  Nenhum resultado.
                </Command.Empty>
                <Command.Group heading="Páginas">
                  {items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Command.Item
                        key={item.path}
                        value={`${item.name} ${item.path}`}
                        onSelect={() => handleSelect(item.path)}
                        className="flex items-center gap-3 cursor-pointer text-slate-700 dark:text-slate-200 data-[selected=true]:bg-indigo-600 data-[selected=true]:text-white"
                      >
                        <Icon size={18} className="shrink-0" aria-hidden />
                        {item.name}
                      </Command.Item>
                    );
                  })}
                </Command.Group>
              </Command.List>
            </Command>
            <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-800 flex items-center gap-4 text-[10px] text-slate-400">
              <span>
                <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono">↑</kbd>
                <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono ml-0.5">↓</kbd>
                {' '}navegar
              </span>
              <span>
                <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono">Enter</kbd>
                {' '}abrir
              </span>
              <span>
                <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono">Esc</kbd>
                {' '}fechar
              </span>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default memo(CommandMenu);
