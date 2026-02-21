import { FIRM_STATUSES } from '@zenith/shared';
import type { CandidateFirmAssignment } from '../types/domain';

const rank = Object.fromEntries(FIRM_STATUSES.map((status, index) => [status, index]));

export function sortAssignments(input: CandidateFirmAssignment[]): CandidateFirmAssignment[] {
  return [...input].sort((a, b) => {
    const byStatus = (rank[a.status_enum] ?? 999) - (rank[b.status_enum] ?? 999);
    if (byStatus !== 0) {
      return byStatus;
    }

    return (
      new Date(b.status_updated_at).getTime() -
      new Date(a.status_updated_at).getTime()
    );
  });
}
