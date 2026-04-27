// ============================================================
// Exportações centralizadas dos componentes de relatórios
// ============================================================

export { KPICards, type KPIData, type KPIColor } from './KPICards';
export { FiltersBar, type FilterConfig, type FilterOption } from './FiltersBar';
export { RowActions, type RowAction, type ActionType, useRowActions } from './RowActions';
export { DataTable, type Column, type ColumnAlign, type ColumnType } from './DataTable';

// Re-exportações de componentes existentes
export { ReportLayout } from '../Reports/ReportLayout';
export { ReportContainer } from '../Reports/ReportContainer';
export { ReportTable } from '../Reports/ReportTable';
export { StatusBadge } from '../Reports/StatusBadge';
