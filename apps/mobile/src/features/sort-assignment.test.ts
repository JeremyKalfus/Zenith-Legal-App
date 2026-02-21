import { describe, expect, it } from 'vitest';
import { sortAssignments } from './sort-assignment';

describe('sortAssignments', () => {
  it('sorts by status priority then recency', () => {
    const sorted = sortAssignments([
      {
        id: '2',
        firm_id: '2',
        status_enum: 'Submitted, waiting to hear from firm',
        status_updated_at: '2026-01-01T00:00:00.000Z',
        firms: { id: '2', name: 'Firm B' },
      },
      {
        id: '1',
        firm_id: '1',
        status_enum: 'Waiting on your authorization to contact/submit',
        status_updated_at: '2026-01-02T00:00:00.000Z',
        firms: { id: '1', name: 'Firm A' },
      },
    ]);

    expect(sorted.map((assignment) => assignment.id)).toEqual(['1', '2']);
  });
});
