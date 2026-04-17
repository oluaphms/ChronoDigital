/**
 * Factory de adapters para relógios de ponto.
 * Centraliza o acesso aos adapters de todas as marcas.
 */

import type { ClockAdapter, ClockBrand } from './types';
import { controlidAdapter } from './controlid.adapter';
import { dimepAdapter } from './dimep.adapter';
import { henryAdapter } from './henry.adapter';

// Registry de adapters disponíveis
const registry: Record<ClockBrand, ClockAdapter> = {
  controlid: controlidAdapter,
  dimep: dimepAdapter,
  henry: henryAdapter,
  // topdata pode ser adicionado aqui quando implementado
  topdata: henryAdapter, // placeholder - usar henry temporariamente
};

/**
 * Retorna o adapter para uma marca específica.
 * @param brand Nome da marca (controlid, dimep, henry, topdata)
 * @returns ClockAdapter implementado para a marca
 * @throws Error se a marca não for suportada
 */
export function getAdapter(brand: string): ClockAdapter {
  const key = (brand || '').toLowerCase().trim() as ClockBrand;
  const adapter = registry[key];
  if (!adapter) {
    const supported = Object.keys(registry).join(', ');
    throw new Error(`Marca de relógio não suportada: "${brand}". Use: ${supported}`);
  }
  return adapter;
}

/**
 * Lista todas as marcas suportadas.
 * @returns Array com os nomes das marcas suportadas
 */
export function listSupportedBrands(): string[] {
  return Object.keys(registry);
}

/**
 * Verifica se uma marca é suportada.
 * @param brand Nome da marca
 * @returns true se suportada, false caso contrário
 */
export function isBrandSupported(brand: string): boolean {
  const key = (brand || '').toLowerCase().trim() as ClockBrand;
  return key in registry;
}

// Re-exportar tipos e adapters individuais
export type { ClockAdapter, ClockBrand, DeviceConfig, Punch } from './types';
export { controlidAdapter } from './controlid.adapter';
export { dimepAdapter } from './dimep.adapter';
export { henryAdapter } from './henry.adapter';
