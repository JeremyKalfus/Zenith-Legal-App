import { describe, expect, it } from 'vitest';
import { FIRM_STATUSES } from '@zenith/shared';
import { getFirmStatusBadgeClasses } from './firm-status-badge';

describe('getFirmStatusBadgeClasses', () => {
  it('returns badge classes for each tracked firm status', () => {
    for (const status of FIRM_STATUSES) {
      const className = getFirmStatusBadgeClasses(status);
      expect(className).toContain('bg-');
      expect(className).toContain('border-');
      expect(className).toContain('text-');
    }
  });
});

