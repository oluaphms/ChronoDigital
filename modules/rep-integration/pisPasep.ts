/**
 * PIS/PASEP (NIS) — saneamento e validação para APIs que exigem 11 dígitos numéricos
 * (ex.: Control iD add_users / update_users: campo `pis` como inteiro JSON).
 */

/** Remove máscara e qualquer caractere não numérico (aceita string ou número do cadastro). */
export function sanitizeDigits(value: unknown): string {
  if (value == null) return '';
  return String(value).replace(/\D/g, '');
}

/** Alias semântico para PIS recebido do cadastro. */
export function sanitizePisInput(value: unknown): string {
  return sanitizeDigits(value);
}

/**
 * Valida PIS/PASEP (NIS) com 11 dígitos e dígito verificador (pesos 3,2,9,8,7,6,5,4,3,2).
 * Não aceita máscara: use `sanitizePisInput` antes.
 */
export function validatePisPasep11(digits11: string): boolean {
  const d = sanitizeDigits(digits11);
  if (d.length !== 11) return false;
  if (!/^\d{11}$/.test(d)) return false;
  const digits = d.split('').map((c) => parseInt(c, 10));
  const w = [3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let s = 0;
  for (let i = 0; i < 10; i++) s += digits[i]! * w[i]!;
  const r = s % 11;
  const dv = r < 2 ? 0 : 11 - r;
  return dv === digits[10];
}

/**
 * Obtém PIS com exatamente 11 dígitos e DV válido, ou null.
 * - 11 dígitos após sanitizar: valida DV.
 * - 10 dígitos: tenta um zero à esquerda (caso comum de cadastro sem o zero inicial).
 */
export function tryNormalizeBrazilianPisTo11Digits(sanitizedDigits: string): string | null {
  const d0 = sanitizeDigits(sanitizedDigits);
  if (!d0) return null;
  if (d0.length > 11) return null;
  if (d0.length === 11) return validatePisPasep11(d0) ? d0 : null;
  if (d0.length === 10) {
    const padded = `0${d0}`;
    return validatePisPasep11(padded) ? padded : null;
  }
  return null;
}

/**
 * Converte 11 dígitos (identificador já validado) para o inteiro JSON exigido pela Control iD.
 * Garante inteiro seguro em JavaScript e consistência com os 11 dígitos do cadastro.
 */
export function elevenPisDigitsToControlIdApiInteger(digits11: string): number {
  const d = sanitizeDigits(digits11);
  if (d.length !== 11 || !validatePisPasep11(d)) {
    throw new Error('PIS interno inválido ao montar payload Control iD.');
  }
  const n = parseInt(d, 10);
  if (!Number.isSafeInteger(n)) {
    throw new Error('PIS numérico fora do intervalo suportado (JavaScript).');
  }
  return n;
}
