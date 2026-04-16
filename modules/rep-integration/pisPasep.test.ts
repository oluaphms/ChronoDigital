import { describe, expect, it } from 'vitest';
import {
  sanitizePisInput,
  tryNormalizeBrazilianPisTo11Digits,
  validatePisPasep11,
  elevenPisDigitsToControlIdApiInteger,
} from './pisPasep';

describe('pisPasep', () => {
  const validPis = '17033259504';

  it('sanitizePisInput remove máscara e não-dígitos', () => {
    expect(sanitizePisInput('170.33259.50-4')).toBe(validPis);
    expect(sanitizePisInput(null)).toBe('');
    expect(sanitizePisInput(17033259504 as unknown as string)).toBe(validPis);
  });

  it('validatePisPasep11 aceita DV correto e rejeita incorreto', () => {
    expect(validatePisPasep11(validPis)).toBe(true);
    expect(validatePisPasep11('17033259505')).toBe(false);
    expect(validatePisPasep11('12345678901')).toBe(false);
  });

  it('tryNormalizeBrazilianPisTo11Digits aceita 11 dígitos válidos', () => {
    expect(tryNormalizeBrazilianPisTo11Digits('17033259504')).toBe(validPis);
    expect(tryNormalizeBrazilianPisTo11Digits('170.332.595-04')).toBe(validPis);
  });

  it('tryNormalizeBrazilianPisTo11Digits recupera PIS de 10 dígitos com zero à esquerda', () => {
    const withLeadingZeros = '00000000019';
    expect(tryNormalizeBrazilianPisTo11Digits('0000000019')).toBe(withLeadingZeros);
  });

  it('tryNormalizeBrazilianPisTo11Digits rejeita lixo ou DV inválido', () => {
    expect(tryNormalizeBrazilianPisTo11Digits('17033259505')).toBe(null);
    expect(tryNormalizeBrazilianPisTo11Digits('170332595041')).toBe(null);
    expect(tryNormalizeBrazilianPisTo11Digits('123')).toBe(null);
  });

  it('elevenPisDigitsToControlIdApiInteger retorna inteiro JSON seguro', () => {
    expect(elevenPisDigitsToControlIdApiInteger(validPis)).toBe(17033259504);
    expect(() => elevenPisDigitsToControlIdApiInteger('17033259505')).toThrow();
  });
});
