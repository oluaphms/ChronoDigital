import { describe, expect, it } from 'vitest';
import { parseAfdLine, parseAFD } from './repParser';

describe('parseAfdLine — layout Portaria (NSR + tipo 3/7 + data + hora + PIS)', () => {
  it('parseia linha compacta tipo 3 (como no REP iDClass)', () => {
    // NSR 16440, tipo 3, 24/04/2024, 10:07:00, PIS 10 dígitos do comprovante → 11 com zero à esquerda
    const line = '00001644032404202410070002966742765';
    const r = parseAfdLine(line);
    expect(r).not.toBeNull();
    expect(r!.nsr).toBe(16440);
    expect(r!.data).toBe('2024-04-24');
    expect(r!.hora).toBe('10:07:00');
    expect(r!.cpfOuPis).toBe('02966742765');
  });

  it('parseia linha tipo 7', () => {
    const line = '00001644172404202410080002966742765';
    const r = parseAfdLine(line);
    expect(r).not.toBeNull();
    expect(r!.nsr).toBe(16441);
  });

  it('mantém layout legado sem dígito de tipo', () => {
    const line = '000016440 24042024 100700 02966742765 E';
    const r = parseAfdLine(line);
    expect(r).not.toBeNull();
    expect(r!.nsr).toBe(16440);
  });
});

describe('parseAFD', () => {
  it('lê bloco com várias linhas tipo 3 compactas', () => {
    const txt = `00001644032404202410070002966742765\n00001644132404202410080002966742765`;
    const rows = parseAFD(txt);
    expect(rows.length).toBe(2);
  });
});
