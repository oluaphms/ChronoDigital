export const IS_PRODUCTION = import.meta.env.MODE === 'production';

export function getEnvBoolean(value: unknown): boolean | undefined {
  if (typeof value !== 'string') return undefined;

  const normalized = value.trim().toLowerCase();

  if (['true', '1', 'yes'].includes(normalized)) return true;
  if (['false', '0', 'no'].includes(normalized)) return false;

  return undefined;
}
