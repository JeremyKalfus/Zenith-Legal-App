import { describe, expect, it } from 'vitest';
import { parseFirmLines } from './ingest';

describe('parseFirmLines', () => {
  it('normalizes blank lines and whitespace', () => {
    const parsed = parseFirmLines('  Firm A  \n\nFirm B\n');

    expect(parsed).toEqual([{ name: 'Firm A' }, { name: 'Firm B' }]);
  });
});
