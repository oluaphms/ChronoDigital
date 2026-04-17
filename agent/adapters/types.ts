/**
 * Contratos da camada Adapter para relógios de ponto (multi-marca).
 * Interface simplificada para o agente local.
 */

export type ClockBrand = 'controlid' | 'dimep' | 'henry' | 'topdata';

export interface DeviceConfig {
  id: string;
  company_id: string;
  brand: ClockBrand;
  ip: string;
  port?: number;
  username?: string;
  password?: string;
  extra?: Record<string, unknown>;
}

export interface Punch {
  employee_id: string;
  timestamp: string;
  event_type: 'entrada' | 'saída' | 'saida' | 'pausa' | 'batida' | string;
  device_id: string;
  company_id: string;
  raw?: Record<string, unknown>;
  nsr?: number;
  dedupe_hash?: string;
}

/**
 * Interface que todos os adapters de relógio devem implementar.
 */
export interface ClockAdapter {
  /**
   * Retorna lista de batidas do relógio.
   * @param device Configuração do dispositivo
   * @param lastSync Data/hora do último sync (ISO string) - opcional
   * @returns Promise com array de batidas normalizadas
   */
  getPunches(device: DeviceConfig, lastSync?: string): Promise<Punch[]>;
}
