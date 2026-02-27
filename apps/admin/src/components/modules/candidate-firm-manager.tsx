'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CITY_OPTIONS,
  filterCandidatesBySearchCityPractice,
  FIRM_STATUSES,
  normalizeCandidatePreferences,
  PRACTICE_AREAS,
  type CityOption,
  type FirmStatus,
  type PracticeArea,
} from '@zenith/shared';
import { supabaseClient } from '@/lib/supabase-client';
import { getFunctionErrorMessage } from '@/lib/function-error';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { getFirmStatusBadgeClasses } from '@/features/firm-status-badge';

type CandidateListItem = {
  id: string;
  name: string;
  email: string;
  mobile: string;
  preferredCities: CityOption[];
  practiceAreas: PracticeArea[];
};

type FirmListItem = {
  id: string;
  name: string;
  active: boolean;
};

type AssignmentRow = {
  id: string;
  candidate_user_id: string;
  firm_id: string;
  status_enum: FirmStatus;
  status_updated_at: string;
  firms: { id: string; name: string } | { id: string; name: string }[] | null;
};

function normalizeFirmRelation(
  relation: AssignmentRow['firms'],
): { id: string; name: string } | null {
  if (!relation) {
    return null;
  }
  return Array.isArray(relation) ? (relation[0] ?? null) : relation;
}

function filterAssignableFirms(
  firms: FirmListItem[],
  assignedFirmIds: Set<string>,
  firmQuery: string,
) {
  const query = firmQuery.trim().toLowerCase();
  return firms.filter((firm) => {
    if (assignedFirmIds.has(firm.id)) {
      return false;
    }
    return query.length === 0 || firm.name.toLowerCase().includes(query);
  });
}

function useCandidateFirmManager() {
  const [candidates, setCandidates] = useState<CandidateListItem[]>([]);
  const [firms, setFirms] = useState<FirmListItem[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState('');
  const [selectedFirmId, setSelectedFirmId] = useState('');
  const [candidateQuery, setCandidateQuery] = useState('');
  const [firmQuery, setFirmQuery] = useState('');
  const [candidateFilters, setCandidateFilters] = useState<{
    selectedCities: CityOption[];
    selectedPracticeAreas: PracticeArea[];
  }>({
    selectedCities: [],
    selectedPracticeAreas: [],
  });
  const [showAllCityFilters, setShowAllCityFilters] = useState(false);
  const [showAllPracticeFilters, setShowAllPracticeFilters] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(true);
  const [isLoadingAssignments, setIsLoadingAssignments] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [pendingStatuses, setPendingStatuses] = useState<Record<string, FirmStatus>>({});
  const selectedCities = candidateFilters.selectedCities;
  const selectedPracticeAreas = candidateFilters.selectedPracticeAreas;

  const loadBaseData = useCallback(async () => {
    setIsLoadingCandidates(true);
    setStatusMessage(null);

    const [candidateResult, firmResult] = await Promise.all([
      supabaseClient
        .from('users_profile')
        .select('id,name,email,mobile')
        .eq('role', 'candidate')
        .order('name', { ascending: true }),
      supabaseClient
        .from('firms')
        .select('id,name,active')
        .eq('active', true)
        .order('name', { ascending: true }),
    ]);

    if (candidateResult.error) {
      setStatusMessage(candidateResult.error.message);
    } else {
      const baseCandidateRows = (candidateResult.data ?? []) as {
        id: string;
        name: string;
        email: string;
        mobile: string;
      }[];

      const candidateIds = baseCandidateRows.map((candidate) => candidate.id);
      const preferenceByUserId = new Map<string, ReturnType<typeof normalizeCandidatePreferences>>();

      if (candidateIds.length > 0) {
        const { data: preferenceData, error: preferenceError } = await supabaseClient
          .from('candidate_preferences')
          .select('user_id,cities,practice_areas,practice_area')
          .in('user_id', candidateIds);

        if (preferenceError) {
          setStatusMessage((previous) => previous ?? preferenceError.message);
        } else {
          for (const row of (preferenceData ?? []) as Record<string, unknown>[]) {
            const userId = row.user_id;
            if (typeof userId !== 'string') {
              continue;
            }
            preferenceByUserId.set(userId, normalizeCandidatePreferences(row));
          }
        }
      }

      const candidateRows = baseCandidateRows.map((candidate) => {
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

      setCandidates(candidateRows);
      setSelectedCandidateId((current) => current || candidateRows[0]?.id || '');
    }

    if (firmResult.error) {
      setStatusMessage((previous) => previous ?? firmResult.error?.message ?? 'Failed to load firms.');
    } else {
      const firmRows = (firmResult.data ?? []) as FirmListItem[];
      setFirms(firmRows);
      setSelectedFirmId((current) => current || firmRows[0]?.id || '');
    }

    setIsLoadingCandidates(false);
  }, []);

  const loadAssignments = useCallback(async (candidateId: string) => {
    if (!candidateId) {
      setAssignments([]);
      setPendingStatuses({});
      return;
    }

    setIsLoadingAssignments(true);
    const { data, error } = await supabaseClient
      .from('candidate_firm_assignments')
      .select('id,candidate_user_id,firm_id,status_enum,status_updated_at,firms(id,name)')
      .eq('candidate_user_id', candidateId)
      .order('status_updated_at', { ascending: false });

    if (error) {
      setStatusMessage(error.message);
      setAssignments([]);
      setPendingStatuses({});
      setIsLoadingAssignments(false);
      return;
    }

    const rows = (data ?? []) as unknown as AssignmentRow[];
    setAssignments(rows);
    setPendingStatuses(
      Object.fromEntries(rows.map((row) => [row.id, row.status_enum])) as Record<string, FirmStatus>,
    );
    setIsLoadingAssignments(false);
  }, []);

  useEffect(() => {
    void loadBaseData();
  }, [loadBaseData]);

  useEffect(() => {
    void loadAssignments(selectedCandidateId);
  }, [loadAssignments, selectedCandidateId]);

  const filteredCandidates = useMemo(
    () => filterCandidatesBySearchCityPractice(candidates, {
      query: candidateQuery,
      selectedCities,
      selectedPracticeAreas,
    }),
    [candidateQuery, candidates, selectedCities, selectedPracticeAreas],
  );

  const assignedFirmIds = useMemo(
    () => new Set(assignments.map((assignment) => assignment.firm_id)),
    [assignments],
  );

  const assignableFirms = useMemo(
    () => filterAssignableFirms(firms, assignedFirmIds, firmQuery),
    [assignedFirmIds, firmQuery, firms],
  );

  useEffect(() => {
    if (assignableFirms.length === 0) {
      setSelectedFirmId('');
      return;
    }
    setSelectedFirmId((current) =>
      assignableFirms.some((firm) => firm.id === current) ? current : assignableFirms[0]!.id,
    );
  }, [assignableFirms]);

  const selectedCandidate = useMemo(
    () => candidates.find((candidate) => candidate.id === selectedCandidateId) ?? null,
    [candidates, selectedCandidateId],
  );

  const handleAssignFirm = useCallback(async () => {
    if (!selectedCandidateId || !selectedFirmId) {
      setStatusMessage('Select a candidate and a firm before assigning.');
      return;
    }

    setBusyAction('assign');
    setStatusMessage(null);
    try {
      const { error } = await supabaseClient.functions.invoke('assign_firm_to_candidate', {
        body: {
          candidate_id: selectedCandidateId,
          firm_id: selectedFirmId,
        },
      });
      if (error) {
        throw error;
      }
      setStatusMessage('Firm assigned.');
      await loadAssignments(selectedCandidateId);
    } catch (error) {
      setStatusMessage(await getFunctionErrorMessage(error));
    } finally {
      setBusyAction(null);
    }
  }, [loadAssignments, selectedCandidateId, selectedFirmId]);

  const handleUpdateStatus = useCallback(
    async (assignmentId: string) => {
      const newStatus = pendingStatuses[assignmentId];
      if (!newStatus) {
        return;
      }
      setBusyAction(`status:${assignmentId}`);
      setStatusMessage(null);
      try {
        const { error } = await supabaseClient.functions.invoke('staff_update_assignment_status', {
          body: {
            assignment_id: assignmentId,
            new_status: newStatus,
          },
        });
        if (error) {
          throw error;
        }
        setStatusMessage('Status updated.');
        await loadAssignments(selectedCandidateId);
      } catch (error) {
        setStatusMessage(await getFunctionErrorMessage(error));
      } finally {
        setBusyAction(null);
      }
    },
    [loadAssignments, pendingStatuses, selectedCandidateId],
  );

  const handleUnassign = useCallback(
    async (assignmentId: string, firmName: string) => {
      if (!window.confirm(`Remove ${firmName} from this candidate?`)) {
        return;
      }
      setBusyAction(`unassign:${assignmentId}`);
      setStatusMessage(null);
      try {
        const { error } = await supabaseClient.functions.invoke('staff_unassign_firm_from_candidate', {
          body: { assignment_id: assignmentId },
        });
        if (error) {
          throw error;
        }
        setStatusMessage('Firm removed from candidate.');
        await loadAssignments(selectedCandidateId);
      } catch (error) {
        setStatusMessage(await getFunctionErrorMessage(error));
      } finally {
        setBusyAction(null);
      }
    },
    [loadAssignments, selectedCandidateId],
  );

  const handleDeleteCandidate = useCallback(async () => {
    if (!selectedCandidate) {
      setStatusMessage('Select a candidate before deleting.');
      return;
    }

    const confirmed = window.confirm(
      `Delete candidate account for ${selectedCandidate.name || 'this candidate'} (${selectedCandidate.email})?\n\nThis permanently deletes the account and cascades app data.`,
    );
    if (!confirmed) {
      return;
    }

    setBusyAction('delete-candidate');
    setStatusMessage(null);

    try {
      const { error } = await supabaseClient.functions.invoke('staff_delete_user', {
        body: { user_id: selectedCandidate.id },
      });

      if (error) {
        throw error;
      }

      setStatusMessage('Candidate deleted.');
      setAssignments([]);
      setPendingStatuses({});
      setSelectedCandidateId((current) => (current === selectedCandidate.id ? '' : current));
      await loadBaseData();
    } catch (error) {
      setStatusMessage(await getFunctionErrorMessage(error));
    } finally {
      setBusyAction(null);
    }
  }, [loadBaseData, selectedCandidate]);

  const handlePendingStatusChange = useCallback((assignmentId: string, value: FirmStatus) => {
    setPendingStatuses((previous) => ({
      ...previous,
      [assignmentId]: value,
    }));
  }, []);

  const toggleCityFilter = useCallback((city: CityOption) => {
    setCandidateFilters((current) => ({
      ...current,
      selectedCities: current.selectedCities.includes(city)
        ? current.selectedCities.filter((value) => value !== city)
        : [...current.selectedCities, city],
    }));
  }, []);

  const togglePracticeFilter = useCallback((practiceArea: PracticeArea) => {
    setCandidateFilters((current) => ({
      ...current,
      selectedPracticeAreas: current.selectedPracticeAreas.includes(practiceArea)
        ? current.selectedPracticeAreas.filter((value) => value !== practiceArea)
        : [...current.selectedPracticeAreas, practiceArea],
    }));
  }, []);

  return {
    candidateQuery,
    setCandidateQuery,
    selectedCities,
    selectedPracticeAreas,
    showAllCityFilters,
    setShowAllCityFilters,
    showAllPracticeFilters,
    setShowAllPracticeFilters,
    firmQuery,
    setFirmQuery,
    selectedCandidateId,
    setSelectedCandidateId,
    selectedFirmId,
    setSelectedFirmId,
    isLoadingCandidates,
    isLoadingAssignments,
    busyAction,
    statusMessage,
    filteredCandidates,
    assignableFirms,
    selectedCandidate,
    assignments,
    pendingStatuses,
    handlePendingStatusChange,
    toggleCityFilter,
    togglePracticeFilter,
    handleAssignFirm,
    handleUpdateStatus,
    handleUnassign,
    handleDeleteCandidate,
    loadAssignments,
  };
}

function CandidateListPanel({
  candidateQuery,
  onCandidateQueryChange,
  selectedCities,
  selectedPracticeAreas,
  showAllCityFilters,
  onToggleShowAllCityFilters,
  showAllPracticeFilters,
  onToggleShowAllPracticeFilters,
  onToggleCity,
  onTogglePracticeArea,
  isLoading,
  candidates,
  selectedCandidateId,
  onSelectCandidate,
}: {
  candidateQuery: string;
  onCandidateQueryChange: (value: string) => void;
  selectedCities: CityOption[];
  selectedPracticeAreas: PracticeArea[];
  showAllCityFilters: boolean;
  onToggleShowAllCityFilters: () => void;
  showAllPracticeFilters: boolean;
  onToggleShowAllPracticeFilters: () => void;
  onToggleCity: (city: CityOption) => void;
  onTogglePracticeArea: (practiceArea: PracticeArea) => void;
  isLoading: boolean;
  candidates: CandidateListItem[];
  selectedCandidateId: string;
  onSelectCandidate: (id: string) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Candidate Manager</CardTitle>
        <CardDescription>Select a candidate and manage visible firms + statuses.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input
          placeholder="Search name, email, mobile"
          value={candidateQuery}
          onChange={(event) => onCandidateQueryChange(event.target.value)}
        />
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Filter by city</p>
          <div className={['flex flex-wrap gap-2', showAllCityFilters ? '' : 'max-h-[34px] overflow-hidden'].join(' ')}>
            {CITY_OPTIONS.map((city) => {
              const selected = selectedCities.includes(city);
              return (
                <button
                  key={city}
                  type="button"
                  className={[
                    'rounded-full px-3 py-1.5 text-xs font-medium',
                    selected ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-900 hover:bg-slate-300',
                  ].join(' ')}
                  onClick={() => onToggleCity(city)}
                >
                  {city}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            className="text-xs font-semibold text-slate-700 hover:text-slate-900"
            onClick={onToggleShowAllCityFilters}
          >
            {showAllCityFilters ? 'Show less' : 'See more'}
          </button>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Filter by practice</p>
          <div className={['flex flex-wrap gap-2', showAllPracticeFilters ? '' : 'max-h-[34px] overflow-hidden'].join(' ')}>
            {PRACTICE_AREAS.map((practiceArea) => {
              const selected = selectedPracticeAreas.includes(practiceArea);
              return (
                <button
                  key={practiceArea}
                  type="button"
                  className={[
                    'rounded-full px-3 py-1.5 text-xs font-medium',
                    selected ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-900 hover:bg-slate-300',
                  ].join(' ')}
                  onClick={() => onTogglePracticeArea(practiceArea)}
                >
                  {practiceArea}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            className="text-xs font-semibold text-slate-700 hover:text-slate-900"
            onClick={onToggleShowAllPracticeFilters}
          >
            {showAllPracticeFilters ? 'Show less' : 'See more'}
          </button>
        </div>
        <div className="max-h-[480px] overflow-auto rounded-md border border-slate-200">
          {isLoading ? (
            <p className="p-3 text-sm text-slate-500">Loading candidates...</p>
          ) : candidates.length === 0 ? (
            <p className="p-3 text-sm text-slate-500">No candidates found.</p>
          ) : (
            candidates.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                className={[
                  'w-full border-b border-slate-100 px-3 py-3 text-left text-sm last:border-b-0',
                  candidate.id === selectedCandidateId ? 'bg-sky-50' : 'bg-white hover:bg-slate-50',
                ].join(' ')}
                onClick={() => onSelectCandidate(candidate.id)}
              >
                <p className="font-semibold text-slate-900">{candidate.name || 'Unnamed Candidate'}</p>
                <p className="text-slate-600">{candidate.email}</p>
                <p className="text-xs text-slate-500">{candidate.mobile}</p>
              </button>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function AssignmentCard({
  assignment,
  busyAction,
  pendingStatus,
  onStatusChange,
  onUpdateStatus,
  onUnassign,
}: {
  assignment: AssignmentRow;
  busyAction: string | null;
  pendingStatus: FirmStatus;
  onStatusChange: (assignmentId: string, value: FirmStatus) => void;
  onUpdateStatus: (assignmentId: string) => void;
  onUnassign: (assignmentId: string, firmName: string) => void;
}) {
  const firm = normalizeFirmRelation(assignment.firms);
  const rowBusy =
    busyAction === `status:${assignment.id}` ||
    busyAction === `unassign:${assignment.id}`;

  return (
    <div className="rounded-md border border-slate-200 p-3">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-slate-900">
            {firm?.name ?? 'Unknown firm'}
          </p>
          <span
            className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${getFirmStatusBadgeClasses(pendingStatus)}`}
          >
            {pendingStatus}
          </span>
          <p className="text-xs text-slate-500">
            Updated {new Date(assignment.status_updated_at).toLocaleString()}
          </p>
        </div>
        <Button
          variant="destructive"
          size="sm"
          disabled={rowBusy || busyAction !== null}
          onClick={() => {
            void onUnassign(assignment.id, firm?.name ?? 'this firm');
          }}
        >
          {busyAction === `unassign:${assignment.id}` ? 'Removing...' : 'Unassign'}
        </Button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <select
          className="h-10 flex-1 rounded-md border border-slate-300 px-2 text-sm"
          value={pendingStatus}
          disabled={rowBusy || busyAction === 'assign'}
          onChange={(event) => {
            onStatusChange(assignment.id, event.target.value as FirmStatus);
          }}
        >
          {FIRM_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          disabled={rowBusy || busyAction === 'assign'}
          onClick={() => {
            void onUpdateStatus(assignment.id);
          }}
        >
          {busyAction === `status:${assignment.id}` ? 'Saving...' : 'Save Status'}
        </Button>
      </div>
    </div>
  );
}

export function CandidateFirmManager() {
  const ctx = useCandidateFirmManager();

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <CandidateListPanel
        candidateQuery={ctx.candidateQuery}
        onCandidateQueryChange={ctx.setCandidateQuery}
        selectedCities={ctx.selectedCities}
        selectedPracticeAreas={ctx.selectedPracticeAreas}
        showAllCityFilters={ctx.showAllCityFilters}
        onToggleShowAllCityFilters={() => ctx.setShowAllCityFilters((value) => !value)}
        showAllPracticeFilters={ctx.showAllPracticeFilters}
        onToggleShowAllPracticeFilters={() => ctx.setShowAllPracticeFilters((value) => !value)}
        onToggleCity={ctx.toggleCityFilter}
        onTogglePracticeArea={ctx.togglePracticeFilter}
        isLoading={ctx.isLoadingCandidates}
        candidates={ctx.filteredCandidates}
        selectedCandidateId={ctx.selectedCandidateId}
        onSelectCandidate={ctx.setSelectedCandidateId}
      />

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>{ctx.selectedCandidate?.name ?? 'Candidate details'}</CardTitle>
              <CardDescription>
                {ctx.selectedCandidate
                  ? `${ctx.selectedCandidate.email} • ${ctx.selectedCandidate.mobile}`
                  : 'Select a candidate to manage assignments.'}
              </CardDescription>
            </div>
            <Button
              variant="destructive"
              size="sm"
              disabled={!ctx.selectedCandidate || ctx.busyAction !== null}
              onClick={() => {
                void ctx.handleDeleteCandidate();
              }}
            >
              {ctx.busyAction === 'delete-candidate' ? 'Deleting...' : 'Delete Candidate'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {ctx.statusMessage ? (
            <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              {ctx.statusMessage}
            </p>
          ) : null}

          <div className="space-y-3 rounded-md border border-slate-200 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Assign active firm
            </p>
            <Input
              placeholder="Filter firms"
              value={ctx.firmQuery}
              onChange={(event) => ctx.setFirmQuery(event.target.value)}
              disabled={!ctx.selectedCandidateId}
            />
            <select
              className="h-10 w-full rounded-md border border-slate-300 px-2 text-sm disabled:bg-slate-100"
              value={ctx.selectedFirmId}
              onChange={(event) => ctx.setSelectedFirmId(event.target.value)}
              disabled={!ctx.selectedCandidateId || ctx.assignableFirms.length === 0}
            >
              {ctx.assignableFirms.length === 0 ? (
                <option value="">No assignable firms</option>
              ) : (
                ctx.assignableFirms.map((firm) => (
                  <option key={firm.id} value={firm.id}>
                    {firm.name}
                  </option>
                ))
              )}
            </select>
            <Button
              onClick={() => {
                void ctx.handleAssignFirm();
              }}
              disabled={!ctx.selectedCandidateId || !ctx.selectedFirmId || ctx.busyAction !== null}
            >
              {ctx.busyAction === 'assign' ? 'Assigning...' : 'Assign Firm'}
            </Button>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Assigned firms
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  void ctx.loadAssignments(ctx.selectedCandidateId);
                }}
                disabled={!ctx.selectedCandidateId || ctx.isLoadingAssignments}
              >
                {ctx.isLoadingAssignments ? 'Refreshing...' : 'Refresh'}
              </Button>
            </div>

            {!ctx.selectedCandidateId ? (
              <p className="rounded-md border border-slate-200 p-3 text-sm text-slate-500">
                Select a candidate to load assignments.
              </p>
            ) : ctx.isLoadingAssignments ? (
              <p className="rounded-md border border-slate-200 p-3 text-sm text-slate-500">
                Loading assignments...
              </p>
            ) : ctx.assignments.length === 0 ? (
              <p className="rounded-md border border-slate-200 p-3 text-sm text-slate-500">
                No assigned firms yet.
              </p>
            ) : (
              <div className="space-y-3">
                {ctx.assignments.map((assignment) => (
                  <AssignmentCard
                    key={assignment.id}
                    assignment={assignment}
                    busyAction={ctx.busyAction}
                    pendingStatus={ctx.pendingStatuses[assignment.id] ?? assignment.status_enum}
                    onStatusChange={ctx.handlePendingStatusChange}
                    onUpdateStatus={ctx.handleUpdateStatus}
                    onUnassign={ctx.handleUnassign}
                  />
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
