import { describe, expect, it } from 'vitest';
import { FIRM_STATUSES } from '@zenith/shared';
import { getFirmStatusBadgeColors } from './firm-status-badge';

describe('getFirmStatusBadgeColors', () => {
  it('returns colors for each tracked firm status', () => {
    for (const status of FIRM_STATUSES) {
      const colors = getFirmStatusBadgeColors(status);

      expect(colors.backgroundColor).toMatch(/^#/);
      expect(colors.borderColor).toMatch(/^#/);
      expect(colors.textColor).toMatch(/^#/);
    }
  });
});

