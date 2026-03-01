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
  name: string | null;
  email: string;
  mobile: string | null;
  jdDegreeDate: string | null;
  preferredCities: CityOption[];
  practiceAreas: PracticeArea[];
  assignedRecruiterUserId: string | null;
  assignedRecruiterDisplayName: string | null;
  currentStatuses: FirmStatus[];
  assignedFirmIds: string[];
  assignedFirmNames: string[];
};

export type StaffFirmOption = {
  id: string;
  name: string;
  active: boolean;
};

export type RecruiterUserOption = {
  id: string;
  name: string | null;
  email: string;
  displayName: string;
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

type CandidateFirmAssignmentLookupRow = {
  candidate_user_id: string;
  firm_id: string;
  status_enum: FirmStatus;
  firms: { id: string; name: string } | { id: string; name: string }[] | null;
};

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

function isMissingCandidateRecruiterAssignmentsTableError(
  error: { message?: string; code?: string } | null | undefined,
): boolean {
  if (!error) {
    return false;
  }

  const message = error.message?.toLowerCase() ?? '';
  return (
    error.code === 'PGRST205' ||
    message.includes("could not find the table 'public.candidate_recruiter_assignments'") ||
    message.includes('candidate_recruiter_assignments')
  );
}

function getRecruiterDisplayName(input: { name: string | null; email: string }): string {
  const trimmedName = input.name?.trim();
  if (trimmedName) {
    return `${trimmedName} (${input.email})`;
  }
  return input.email;
}

export async function listRecruiterUsers(): Promise<RecruiterUserOption[]> {
  const { data, error } = await supabase
    .from('users_profile')
    .select('id,name,email')
    .eq('role', 'staff')
    .order('name', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as { id: string; name: string | null; email: string }[]).map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    displayName: getRecruiterDisplayName(row),
  }));
}

export async function listStaffCandidates(): Promise<StaffCandidateListItem[]> {
  const { data, error } = await supabase
    .from('users_profile')
    .select('id,name,email,mobile,jd_degree_date')
    .eq('role', 'candidate')
    .order('name', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const candidateRows = (data ?? []) as {
    id: string;
    name: string | null;
    email: string;
    mobile: string | null;
    jd_degree_date: string | null;
  }[];

  if (candidateRows.length === 0) {
    return [];
  }

  const candidateIds = candidateRows.map((row) => row.id);
  const [preferencesResult, assignmentLookupResult, recruiterAssignmentResult] = await Promise.all([
    supabase
      .from('candidate_preferences')
      .select('user_id,cities,practice_areas,practice_area')
      .in('user_id', candidateIds),
    supabase
      .from('candidate_firm_assignments')
      .select('candidate_user_id,firm_id,status_enum,firms(id,name)')
      .in('candidate_user_id', candidateIds),
    supabase
      .from('candidate_recruiter_assignments')
      .select('candidate_user_id,recruiter_user_id')
      .in('candidate_user_id', candidateIds),
  ]);

  if (preferencesResult.error) {
    throw new Error(preferencesResult.error.message);
  }

  if (assignmentLookupResult.error) {
    throw new Error(assignmentLookupResult.error.message);
  }

  if (
    recruiterAssignmentResult.error &&
    !isMissingCandidateRecruiterAssignmentsTableError(recruiterAssignmentResult.error)
  ) {
    throw new Error(recruiterAssignmentResult.error.message);
  }

  const preferenceByUserId = new Map<string, ReturnType<typeof normalizeCandidatePreferences>>();
  for (const row of (preferencesResult.data ?? []) as Record<string, unknown>[]) {
    const userId = row.user_id;
    if (typeof userId !== 'string') {
      continue;
    }
    preferenceByUserId.set(userId, normalizeCandidatePreferences(row));
  }

  const assignmentAggregateByCandidateId = new Map<
    string,
    { statuses: Set<FirmStatus>; firmIds: Set<string>; firmNames: Set<string> }
  >();
  for (const row of (assignmentLookupResult.data ?? []) as CandidateFirmAssignmentLookupRow[]) {
    if (!isTrackedFirmStatus(row.status_enum)) {
      continue;
    }
    const candidateId = row.candidate_user_id;
    const existing = assignmentAggregateByCandidateId.get(candidateId) ?? {
      statuses: new Set<FirmStatus>(),
      firmIds: new Set<string>(),
      firmNames: new Set<string>(),
    };

    existing.statuses.add(row.status_enum);
    existing.firmIds.add(row.firm_id);
    const firm = normalizeFirmRelation(row.firms);
    if (firm?.name) {
      existing.firmNames.add(firm.name);
    }

    assignmentAggregateByCandidateId.set(candidateId, existing);
  }

  const recruiterAssignmentByCandidateId = new Map<string, string | null>();
  const recruiterUserIds = new Set<string>();
  for (const row of (recruiterAssignmentResult.data ?? []) as {
    candidate_user_id: string;
    recruiter_user_id: string | null;
  }[]) {
    recruiterAssignmentByCandidateId.set(row.candidate_user_id, row.recruiter_user_id ?? null);
    if (row.recruiter_user_id) {
      recruiterUserIds.add(row.recruiter_user_id);
    }
  }

  const recruiterDisplayNameByUserId = new Map<string, string>();
  if (recruiterUserIds.size > 0) {
    const { data: recruiterData, error: recruiterError } = await supabase
      .from('users_profile')
      .select('id,name,email')
      .eq('role', 'staff')
      .in('id', Array.from(recruiterUserIds));

    if (recruiterError) {
      throw new Error(recruiterError.message);
    }

    for (const recruiter of (recruiterData ?? []) as { id: string; name: string | null; email: string }[]) {
      recruiterDisplayNameByUserId.set(recruiter.id, getRecruiterDisplayName(recruiter));
    }
  }

  return candidateRows.map((candidate) => {
    const normalizedPreferences = preferenceByUserId.get(candidate.id) ?? {
      preferredCities: [],
      practiceAreas: [],
    };
    const assignmentAggregate = assignmentAggregateByCandidateId.get(candidate.id);
    const assignedRecruiterUserId = recruiterAssignmentByCandidateId.get(candidate.id) ?? null;

    return {
      ...candidate,
      jdDegreeDate: candidate.jd_degree_date ?? null,
      preferredCities: normalizedPreferences.preferredCities,
      practiceAreas: normalizedPreferences.practiceAreas,
      assignedRecruiterUserId,
      assignedRecruiterDisplayName: assignedRecruiterUserId
        ? recruiterDisplayNameByUserId.get(assignedRecruiterUserId) ?? null
        : null,
      currentStatuses: assignmentAggregate ? Array.from(assignmentAggregate.statuses) : [],
      assignedFirmIds: assignmentAggregate ? Array.from(assignmentAggregate.firmIds) : [],
      assignedFirmNames: assignmentAggregate ? Array.from(assignmentAggregate.firmNames) : [],
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

export async function setCandidateAssignedRecruiter(
  candidateId: string,
  recruiterUserId: string | null,
  actorUserId: string | null,
): Promise<void> {
  if (!recruiterUserId) {
    const { error } = await supabase
      .from('candidate_recruiter_assignments')
      .delete()
      .eq('candidate_user_id', candidateId);

    if (error) {
      throw new Error(error.message);
    }

    return;
  }

  const { error } = await supabase
    .from('candidate_recruiter_assignments')
    .upsert(
      {
        candidate_user_id: candidateId,
        recruiter_user_id: recruiterUserId,
        updated_by: actorUserId,
      },
      { onConflict: 'candidate_user_id' },
    );

  if (error) {
    throw new Error(error.message);
  }
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
