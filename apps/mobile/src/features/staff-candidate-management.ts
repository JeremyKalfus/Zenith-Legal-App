import {
  FIRM_STATUSES,
  normalizeCandidatePreferences,
  type CityOption,
  type FirmStatus,
  type PracticeArea,
} from '@zenith/shared';
import { supabase } from '../lib/supabase';
import { getFunctionErrorMessage } from '../lib/function-error';

export type StaffCandidateListItem = {
  id: string;
  name: string;
  email: string;
  mobile: string;
  preferredCities: CityOption[];
  practiceAreas: PracticeArea[];
};

export type StaffFirmOption = {
  id: string;
  name: string;
  active: boolean;
};

export type StaffCandidateAssignmentRow = {
  id: string;
  candidate_user_id: string;
  firm_id: string;
  status_enum: FirmStatus;
  status_updated_at: string;
  firm: {
    id: string;
    name: string;
  };
};

type FunctionSuccess<T> = {
  success: true;
} & T;

function normalizeFirmRelation(
  relation:
    | { id: string; name: string }
    | { id: string; name: string }[]
    | null
    | undefined,
): { id: string; name: string } | null {
  if (!relation) {
    return null;
  }
  return Array.isArray(relation) ? (relation[0] ?? null) : relation;
}

function isTrackedFirmStatus(value: unknown): value is FirmStatus {
  return typeof value === 'string' && FIRM_STATUSES.includes(value as FirmStatus);
}

export async function listStaffCandidates(): Promise<StaffCandidateListItem[]> {
  const { data, error } = await supabase
    .from('users_profile')
    .select('id,name,email,mobile')
    .eq('role', 'candidate')
    .order('name', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const candidateRows = (data ?? []) as {
    id: string;
    name: string;
    email: string;
    mobile: string;
  }[];

  if (candidateRows.length === 0) {
    return [];
  }

  const candidateIds = candidateRows.map((row) => row.id);
  const { data: preferenceData, error: preferenceError } = await supabase
    .from('candidate_preferences')
    .select('user_id,cities,practice_areas,practice_area')
    .in('user_id', candidateIds);

  if (preferenceError) {
    throw new Error(preferenceError.message);
  }

  const preferenceByUserId = new Map<string, ReturnType<typeof normalizeCandidatePreferences>>();
  for (const row of (preferenceData ?? []) as Record<string, unknown>[]) {
    const userId = row.user_id;
    if (typeof userId !== 'string') {
      continue;
    }
    preferenceByUserId.set(userId, normalizeCandidatePreferences(row));
  }

  return candidateRows.map((candidate) => {
    const normalizedPreferences = preferenceByUserId.get(candidate.id) ?? {
      preferredCities: [],
      practiceAreas: [],
    };

    return {
      ...candidate,
      preferredCities: normalizedPreferences.preferredCities,
      practiceAreas: normalizedPreferences.practiceAreas,
    };
  });
}

export async function listActiveFirms(): Promise<StaffFirmOption[]> {
  const { data, error } = await supabase
    .from('firms')
    .select('id,name,active')
    .eq('active', true)
    .order('name', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as StaffFirmOption[];
}

export async function listCandidateAssignments(
  candidateId: string,
): Promise<StaffCandidateAssignmentRow[]> {
  const { data, error } = await supabase
    .from('candidate_firm_assignments')
    .select('id,candidate_user_id,firm_id,status_enum,status_updated_at,firms(id,name)')
    .eq('candidate_user_id', candidateId)
    .order('status_updated_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as Record<string, unknown>[])
    .flatMap((row) => {
      const status = row.status_enum;
      if (!isTrackedFirmStatus(status)) {
        return [];
      }

      const firm = normalizeFirmRelation(
        row.firms as { id: string; name: string }[] | { id: string; name: string } | null,
      );
      return [{
        id: String(row.id),
        candidate_user_id: String(row.candidate_user_id),
        firm_id: String(row.firm_id),
        status_enum: status,
        status_updated_at: String(row.status_updated_at),
        firm: {
          id: firm?.id ?? '',
          name: firm?.name ?? 'Unknown Firm',
        },
      }];
    });
}

export async function assignFirmToCandidate(
  candidateId: string,
  firmId: string,
): Promise<FunctionSuccess<{ assignment: unknown }>> {
  const { data, error } = await supabase.functions.invoke('assign_firm_to_candidate', {
    body: { candidate_id: candidateId, firm_id: firmId },
  });

  if (error) {
    throw new Error(await getFunctionErrorMessage(error));
  }

  return data as FunctionSuccess<{ assignment: unknown }>;
}

export async function updateCandidateAssignmentStatus(
  assignmentId: string,
  newStatus: FirmStatus,
): Promise<FunctionSuccess<{ assignment: unknown; unchanged?: boolean }>> {
  const { data, error } = await supabase.functions.invoke('staff_update_assignment_status', {
    body: { assignment_id: assignmentId, new_status: newStatus },
  });

  if (error) {
    throw new Error(await getFunctionErrorMessage(error));
  }

  return data as FunctionSuccess<{ assignment: unknown; unchanged?: boolean }>;
}

export async function unassignFirmFromCandidate(
  assignmentId: string,
): Promise<FunctionSuccess<{ deleted_assignment_id: string }>> {
  const { data, error } = await supabase.functions.invoke('staff_unassign_firm_from_candidate', {
    body: { assignment_id: assignmentId },
  });

  if (error) {
    throw new Error(await getFunctionErrorMessage(error));
  }

  return data as FunctionSuccess<{ deleted_assignment_id: string }>;
}
