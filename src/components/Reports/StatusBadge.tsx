// ============================================================
// Componente Badge para Status/Risco/Severidade
// ============================================================

import React from 'react';

type StatusType = 'success' | 'warning' | 'error' | 'info' | 'neutral';

interface StatusBadgeProps {
  status: string;
  type?: StatusType;
  size?: 'sm' | 'md' | 'lg';
}

const getStatusStyles = (type: StatusType, size: 'sm' | 'md' | 'lg') => {
  const baseStyles = 'font-semibold rounded-full inline-block';

  const sizeStyles = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-1.5 text-sm',
    lg: 'px-4 py-2 text-base',
  };

  const typeStyles = {
    success: 'bg-green-100 text-green-800 border border-green-300',
    warning: 'bg-yellow-100 text-yellow-800 border border-yellow-300',
    error: 'bg-red-100 text-red-800 border border-red-300',
    info: 'bg-blue-100 text-blue-800 border border-blue-300',
    neutral: 'bg-gray-100 text-gray-800 border border-gray-300',
  };

  return `${baseStyles} ${sizeStyles[size]} ${typeStyles[type]}`;
};

const getStatusType = (status: string): StatusType => {
  const lowerStatus = status.toLowerCase();

  // Jornada
  if (lowerStatus === 'cumprida') return 'success';
  if (lowerStatus === 'incompleta') return 'warning';
  if (lowerStatus === 'excedida') return 'info';
  if (lowerStatus === 'ausente') return 'error';

  // Severidade
  if (lowerStatus === 'leve') return 'warning';
  if (lowerStatus === 'média') return 'warning';
  if (lowerStatus === 'crítica') return 'error';

  // Risco
  if (lowerStatus === 'baixo') return 'success';
  if (lowerStatus === 'médio') return 'warning';
  if (lowerStatus === 'alto') return 'error';

  // Tipo de hora extra
  if (lowerStatus === '50%') return 'warning';
  if (lowerStatus === '100%') return 'error';
  if (lowerStatus === 'banco de horas') return 'info';

  return 'neutral';
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  type,
  size = 'md',
}) => {
  const statusType: StatusType = type ?? getStatusType(status);
  const resolvedSize = (size ?? 'md') as 'sm' | 'md' | 'lg';
  const styles = getStatusStyles(statusType, resolvedSize);

  return <span className={styles}>{status}</span>;
};
