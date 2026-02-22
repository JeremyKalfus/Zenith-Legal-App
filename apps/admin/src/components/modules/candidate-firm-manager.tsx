'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FIRM_STATUSES, type FirmStatus } from '@zenith/shared';
import { supabaseClient } from '@/lib/supabase-client';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';

type CandidateListItem = {
  id: string;
  name: string;
  email: string;
  mobile: string;
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

type FunctionErrorPayload = {
  code?: string;
  error?: string;
};

async function getFunctionErrorMessage(error: unknown): Promise<string> {
  const errorObject = error as {
    message?: string;
    context?: { json?: () => Promise<unknown>; text?: () => Promise<string> };
  } | null;

  if (errorObject?.context?.json) {
    try {
      const payload = (await errorObject.context.json()) as FunctionErrorPayload;
      if (payload.code === 'duplicate_assignment') {
        return 'This firm is already assigned to this candidate.';
      }
      if (payload.code === 'assignment_not_found') {
        return 'That assignment could not be found. Refresh and try again.';
      }
      if (payload.code === 'candidate_not_found') {
        return 'The selected candidate could not be found.';
      }
      if (payload.code === 'firm_not_found') {
        return 'The selected firm could not be found.';
      }
      if (payload.code === 'firm_inactive') {
        return 'That firm is inactive and cannot be assigned.';
      }
      if (typeof payload.error === 'string') {
        return payload.error;
      }
    } catch {
      // fall through
    }
  }

  return errorObject?.message ?? 'Could not save your change.';
}

function normalizeFirmRelation(
  relation: AssignmentRow['firms'],
): { id: string; name: string } | null {
  if (!relation) {
    return null;
  }
  return Array.isArray(relation) ? (relation[0] ?? null) : relation;
}

export function CandidateFirmManager() {
  const [candidates, setCandidates] = useState<CandidateListItem[]>([]);
  const [firms, setFirms] = useState<FirmListItem[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState('');
  const [selectedFirmId, setSelectedFirmId] = useState('');
  const [candidateQuery, setCandidateQuery] = useState('');
  const [firmQuery, setFirmQuery] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(true);
  const [isLoadingAssignments, setIsLoadingAssignments] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [pendingStatuses, setPendingStatuses] = useState<Record<string, FirmStatus>>({});

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
      const candidateRows = (candidateResult.data ?? []) as CandidateListItem[];
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

  const filteredCandidates = useMemo(() => {
    const query = candidateQuery.trim().toLowerCase();
    if (!query) {
      return candidates;
    }
    return candidates.filter((candidate) =>
      [candidate.name, candidate.email, candidate.mobile]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(query)),
    );
  }, [candidateQuery, candidates]);

  const assignedFirmIds = useMemo(
    () => new Set(assignments.map((assignment) => assignment.firm_id)),
    [assignments],
  );

  const assignableFirms = useMemo(() => {
    const query = firmQuery.trim().toLowerCase();
    return firms.filter((firm) => {
      if (assignedFirmIds.has(firm.id)) {
        return false;
      }
      if (!query) {
        return true;
      }
      return firm.name.toLowerCase().includes(query);
    });
  }, [assignedFirmIds, firmQuery, firms]);

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

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <Card>
        <CardHeader>
          <CardTitle>Candidate Manager</CardTitle>
          <CardDescription>Select a candidate and manage visible firms + statuses.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            placeholder="Search name, email, mobile"
            value={candidateQuery}
            onChange={(event) => setCandidateQuery(event.target.value)}
          />
          <div className="max-h-[480px] overflow-auto rounded-md border border-slate-200">
            {isLoadingCandidates ? (
              <p className="p-3 text-sm text-slate-500">Loading candidates...</p>
            ) : filteredCandidates.length === 0 ? (
              <p className="p-3 text-sm text-slate-500">No candidates found.</p>
            ) : (
              filteredCandidates.map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  className={[
                    'w-full border-b border-slate-100 px-3 py-3 text-left text-sm last:border-b-0',
                    candidate.id === selectedCandidateId ? 'bg-sky-50' : 'bg-white hover:bg-slate-50',
                  ].join(' ')}
                  onClick={() => setSelectedCandidateId(candidate.id)}
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

      <Card>
        <CardHeader>
          <CardTitle>{selectedCandidate?.name ?? 'Candidate details'}</CardTitle>
          <CardDescription>
            {selectedCandidate
              ? `${selectedCandidate.email} • ${selectedCandidate.mobile}`
              : 'Select a candidate to manage assignments.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {statusMessage ? (
            <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              {statusMessage}
            </p>
          ) : null}

          <div className="space-y-3 rounded-md border border-slate-200 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Assign active firm
            </p>
            <Input
              placeholder="Filter firms"
              value={firmQuery}
              onChange={(event) => setFirmQuery(event.target.value)}
              disabled={!selectedCandidateId}
            />
            <select
              className="h-10 w-full rounded-md border border-slate-300 px-2 text-sm disabled:bg-slate-100"
              value={selectedFirmId}
              onChange={(event) => setSelectedFirmId(event.target.value)}
              disabled={!selectedCandidateId || assignableFirms.length === 0}
            >
              {assignableFirms.length === 0 ? (
                <option value="">No assignable firms</option>
              ) : (
                assignableFirms.map((firm) => (
                  <option key={firm.id} value={firm.id}>
                    {firm.name}
                  </option>
                ))
              )}
            </select>
            <Button
              onClick={() => {
                void handleAssignFirm();
              }}
              disabled={!selectedCandidateId || !selectedFirmId || busyAction !== null}
            >
              {busyAction === 'assign' ? 'Assigning...' : 'Assign Firm'}
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
                  void loadAssignments(selectedCandidateId);
                }}
                disabled={!selectedCandidateId || isLoadingAssignments}
              >
                {isLoadingAssignments ? 'Refreshing...' : 'Refresh'}
              </Button>
            </div>

            {!selectedCandidateId ? (
              <p className="rounded-md border border-slate-200 p-3 text-sm text-slate-500">
                Select a candidate to load assignments.
              </p>
            ) : isLoadingAssignments ? (
              <p className="rounded-md border border-slate-200 p-3 text-sm text-slate-500">
                Loading assignments...
              </p>
            ) : assignments.length === 0 ? (
              <p className="rounded-md border border-slate-200 p-3 text-sm text-slate-500">
                No assigned firms yet.
              </p>
            ) : (
              <div className="space-y-3">
                {assignments.map((assignment) => {
                  const firm = normalizeFirmRelation(assignment.firms);
                  const rowBusy =
                    busyAction === `status:${assignment.id}` ||
                    busyAction === `unassign:${assignment.id}`;
                  const pendingStatus = pendingStatuses[assignment.id] ?? assignment.status_enum;
                  return (
                    <div key={assignment.id} className="rounded-md border border-slate-200 p-3">
                      <div className="mb-2 flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-900">
                            {firm?.name ?? 'Unknown firm'}
                          </p>
                          <p className="text-xs text-slate-500">
                            Updated {new Date(assignment.status_updated_at).toLocaleString()}
                          </p>
                        </div>
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={rowBusy || busyAction !== null}
                          onClick={() => {
                            void handleUnassign(assignment.id, firm?.name ?? 'this firm');
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
                            setPendingStatuses((previous) => ({
                              ...previous,
                              [assignment.id]: event.target.value as FirmStatus,
                            }));
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
                            void handleUpdateStatus(assignment.id);
                          }}
                        >
                          {busyAction === `status:${assignment.id}` ? 'Saving...' : 'Save Status'}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
