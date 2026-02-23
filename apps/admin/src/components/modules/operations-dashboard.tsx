'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { FIRM_STATUSES, type AppointmentStatus } from '@zenith/shared';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { supabaseClient } from '@/lib/supabase-client';
import { bulkPasteSchema, parseFirmLines, type BulkPasteInput } from '@/schemas/ingest';

type Candidate = { id: string; name: string; email: string };
type Firm = { id: string; name: string };
type Assignment = {
  id: string;
  candidate_user_id: string;
  firm_id: string;
  status_enum: string;
  candidates: Array<{ name: string }> | null;
  firms: Array<{ name: string }> | null;
};

type SupportRequest = {
  id: string;
  request_type: 'export' | 'delete';
  status: string;
  notes: string | null;
};

type AppointmentRecord = {
  id: string;
  candidate_user_id: string;
  title: string;
  description: string | null;
  start_at_utc: string;
  end_at_utc: string;
  timezone_label: string;
  modality: 'virtual' | 'in_person';
  location_text: string | null;
  video_url: string | null;
  status: AppointmentStatus;
  candidate: Array<{ name: string | null; email: string | null }> | null;
};

type AppointmentDraft = {
  title: string;
  description: string;
  modality: 'virtual' | 'in_person';
  locationText: string;
  videoUrl: string;
  startAtUtc: string;
  endAtUtc: string;
  timezoneLabel: string;
};

const APPOINTMENT_STATUS_FILTERS: AppointmentStatus[] = ['requested', 'accepted', 'declined', 'cancelled'];

function statusLabel(status: AppointmentStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function toAppointmentDraft(appointment: AppointmentRecord): AppointmentDraft {
  return {
    title: appointment.title,
    description: appointment.description ?? '',
    modality: appointment.modality,
    locationText: appointment.location_text ?? '',
    videoUrl: appointment.video_url ?? '',
    startAtUtc: appointment.start_at_utc,
    endAtUtc: appointment.end_at_utc,
    timezoneLabel: appointment.timezone_label,
  };
}

async function readFunctionErrorMessage(error: unknown): Promise<string> {
  if (
    typeof error === 'object' &&
    error &&
    'context' in error &&
    (error as { context?: unknown }).context instanceof Response
  ) {
    const response = (error as { context: Response }).context;
    try {
      const payload = (await response.clone().json()) as { error?: unknown };
      if (typeof payload.error === 'string' && payload.error.trim()) {
        return payload.error;
      }
    } catch {
      try {
        const text = await response.clone().text();
        if (text.trim()) {
          return text;
        }
      } catch {
        // Fall through to generic message.
      }
    }
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return 'Request failed';
}

export function OperationsDashboard() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [firms, setFirms] = useState<Firm[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [auditEvents, setAuditEvents] = useState<Record<string, unknown>[]>([]);
  const [appointments, setAppointments] = useState<AppointmentRecord[]>([]);
  const [calendarConnections, setCalendarConnections] = useState<Record<string, unknown>[]>([]);
  const [supportRequests, setSupportRequests] = useState<SupportRequest[]>([]);

  const [selectedCandidateId, setSelectedCandidateId] = useState('');
  const [selectedFirmId, setSelectedFirmId] = useState('');
  const [selectedAssignmentId, setSelectedAssignmentId] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<
    (typeof FIRM_STATUSES)[number]
  >(FIRM_STATUSES[0]);

  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [newFirmName, setNewFirmName] = useState('');
  const [appointmentStatusFilter, setAppointmentStatusFilter] =
    useState<AppointmentStatus>('requested');
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);
  const [appointmentDraft, setAppointmentDraft] = useState<AppointmentDraft | null>(null);
  const [isSavingAppointment, setIsSavingAppointment] = useState(false);

  const { register, handleSubmit, reset } = useForm<BulkPasteInput>({
    resolver: zodResolver(bulkPasteSchema),
    defaultValues: { lines: '' },
  });

  const loadAppointments = useCallback(async () => {
    const { data, error } = await supabaseClient
      .from('appointments')
      .select(
        'id,candidate_user_id,title,description,start_at_utc,end_at_utc,timezone_label,modality,location_text,video_url,status,candidate:users_profile!appointments_candidate_user_id_fkey(name,email)',
      )
      .order('start_at_utc', { ascending: true })
      .limit(50);

    if (error) {
      setStatusMessage(error.message);
      return;
    }

    const nextAppointments = ((data ?? []) as unknown) as AppointmentRecord[];
    setAppointments(nextAppointments);
    setSelectedAppointmentId((currentId) => {
      const preservedId = currentId && nextAppointments.some((item) => item.id === currentId) ? currentId : null;
      const preferredId =
        preservedId ??
        nextAppointments.find((item) => item.status === appointmentStatusFilter)?.id ??
        nextAppointments[0]?.id ??
        null;
      const selected = nextAppointments.find((item) => item.id === preferredId) ?? null;
      setAppointmentDraft(selected ? toAppointmentDraft(selected) : null);
      return preferredId;
    });
  }, [appointmentStatusFilter]);

  const loadData = useCallback(async () => {
    const [candidateResult, firmResult, assignmentResult, auditResult, calendarResult, supportResult, contactResult] =
      await Promise.all([
        supabaseClient
          .from('users_profile')
          .select('id,name,email')
          .eq('role', 'candidate')
          .order('name', { ascending: true }),
        supabaseClient
          .from('firms')
          .select('id,name')
          .eq('active', true)
          .order('name', { ascending: true }),
        supabaseClient
          .from('candidate_firm_assignments')
          .select('id,candidate_user_id,firm_id,status_enum,candidates:users_profile!candidate_firm_assignments_candidate_user_id_fkey(name),firms(name)')
          .order('status_updated_at', { ascending: false })
          .limit(30),
        supabaseClient.from('audit_events').select('*').order('created_at', { ascending: false }).limit(20),
        supabaseClient.from('calendar_connections').select('*').limit(20),
        supabaseClient.from('support_data_requests').select('*').order('created_at', { ascending: false }).limit(20),
        supabaseClient.from('recruiter_contact_config').select('phone,email').eq('is_active', true).maybeSingle(),
      ]);

    if (candidateResult.data) {
      setCandidates(candidateResult.data as Candidate[]);
      setSelectedCandidateId((current) => current || candidateResult.data?.[0]?.id || '');
    }

    if (firmResult.data) {
      setFirms(firmResult.data as Firm[]);
      setSelectedFirmId((current) => current || firmResult.data?.[0]?.id || '');
    }

    if (assignmentResult.data) {
      setAssignments(assignmentResult.data as unknown as Assignment[]);
      setSelectedAssignmentId(
        (current) => current || assignmentResult.data?.[0]?.id || '',
      );
    }

    if (auditResult.data) {
      setAuditEvents(auditResult.data);
    }

    if (calendarResult.data) {
      setCalendarConnections(calendarResult.data);
    }

    if (supportResult.data) {
      setSupportRequests(supportResult.data as SupportRequest[]);
    }

    if (contactResult.data) {
      setContactPhone(contactResult.data.phone ?? '');
      setContactEmail(contactResult.data.email ?? '');
    }
    await loadAppointments();
  }, [loadAppointments]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const channel: RealtimeChannel = supabaseClient
      .channel('admin-appointments')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appointments' },
        () => {
          void loadAppointments();
        },
      )
      .subscribe();

    return () => {
      void supabaseClient.removeChannel(channel);
    };
  }, [loadAppointments]);

  const assignmentRows = useMemo(
    () =>
      assignments.map((assignment) => (
        <tr key={assignment.id} className="border-b border-slate-100 text-sm">
          <td className="px-2 py-2">
            {assignment.candidates?.[0]?.name ?? 'Candidate'}
          </td>
          <td className="px-2 py-2">{assignment.firms?.[0]?.name ?? 'Firm'}</td>
          <td className="px-2 py-2">{assignment.status_enum}</td>
        </tr>
      )),
    [assignments],
  );

  const filteredAppointments = useMemo(
    () => appointments.filter((appointment) => appointment.status === appointmentStatusFilter),
    [appointmentStatusFilter, appointments],
  );

  const selectedAppointment = useMemo(
    () => appointments.find((appointment) => appointment.id === selectedAppointmentId) ?? null,
    [appointments, selectedAppointmentId],
  );

  const submitAppointmentUpdate = useCallback(
    async (statusOverride?: 'accepted' | 'declined' | 'cancelled') => {
      if (!selectedAppointment || !appointmentDraft) {
        return;
      }

      setIsSavingAppointment(true);
      try {
        const { error } = await supabaseClient.functions.invoke('staff_update_appointment', {
          body: {
            id: selectedAppointment.id,
            ...appointmentDraft,
            status: statusOverride,
          },
        });

        if (error) {
          const message = await readFunctionErrorMessage(error);
          setStatusMessage(
            message.toLowerCase().includes('conflict')
              ? 'Cannot accept this appointment because it overlaps another accepted appointment.'
              : message,
          );
          return;
        }

        setStatusMessage(statusOverride ? `Appointment ${statusOverride}.` : 'Appointment updated.');
        await loadAppointments();
      } finally {
        setIsSavingAppointment(false);
      }
    },
    [appointmentDraft, loadAppointments, selectedAppointment],
  );

  return (
    <div className="space-y-4">
      {statusMessage ? (
        <p className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
          {statusMessage}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Candidate Directory</CardTitle>
            <CardDescription>Recruiter-only visibility into candidates.</CardDescription>
          </CardHeader>
          <CardContent className="max-h-64 overflow-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-xs uppercase text-slate-500">
                  <th className="px-2 py-2">Name</th>
                  <th className="px-2 py-2">Email</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((candidate) => (
                  <tr key={candidate.id} className="border-b border-slate-100 text-sm">
                    <td className="px-2 py-2">{candidate.name}</td>
                    <td className="px-2 py-2">{candidate.email}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Firm Master + Bulk Paste Ingest</CardTitle>
            <CardDescription>Ingest firm catalog without CSV.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="Create single firm"
                value={newFirmName}
                onChange={(event) => setNewFirmName(event.target.value)}
              />
              <Button
                onClick={async () => {
                  const { error } = await supabaseClient
                    .from('firms')
                    .insert({ name: newFirmName, normalized_name: newFirmName.toLowerCase() });
                  if (error) {
                    setStatusMessage(error.message);
                  } else {
                    setStatusMessage('Firm created.');
                    setNewFirmName('');
                    loadData();
                  }
                }}
              >
                Add
              </Button>
            </div>
            <form
              className="space-y-2"
              onSubmit={handleSubmit(async (values) => {
                const parsed = parseFirmLines(values.lines);
                const { data, error } = await supabaseClient.functions.invoke(
                  'bulk_paste_ingest_firms',
                  {
                    body: { rows: parsed },
                  },
                );

                if (error) {
                  setStatusMessage(error.message);
                  return;
                }

                setStatusMessage(
                  `Ingest complete: ${data.accepted_count ?? 0} accepted, ${data.rejected_count ?? 0} rejected.`,
                );
                reset();
                loadData();
              })}
            >
              <Textarea
                rows={7}
                placeholder="Paste one law firm per line"
                {...register('lines')}
              />
              <Button type="submit">Run Bulk Paste Import</Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Candidate-Firm Assignment Manager</CardTitle>
            <CardDescription>Manual assignment only, default status enforced.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <label className="text-xs font-medium uppercase text-slate-500">Candidate</label>
            <select
              className="h-10 w-full rounded-md border border-slate-300 px-2 text-sm"
              value={selectedCandidateId}
              onChange={(event) => setSelectedCandidateId(event.target.value)}
            >
              {candidates.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </option>
              ))}
            </select>

            <label className="text-xs font-medium uppercase text-slate-500">Firm</label>
            <select
              className="h-10 w-full rounded-md border border-slate-300 px-2 text-sm"
              value={selectedFirmId}
              onChange={(event) => setSelectedFirmId(event.target.value)}
            >
              {firms.map((firm) => (
                <option key={firm.id} value={firm.id}>
                  {firm.name}
                </option>
              ))}
            </select>

            <Button
              onClick={async () => {
                const { error } = await supabaseClient.functions.invoke(
                  'assign_firm_to_candidate',
                  {
                    body: {
                      candidate_id: selectedCandidateId,
                      firm_id: selectedFirmId,
                    },
                  },
                );

                if (error) {
                  setStatusMessage(error.message);
                } else {
                  setStatusMessage('Assignment created.');
                  loadData();
                }
              }}
            >
              Assign Firm
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Status Update Console</CardTitle>
            <CardDescription>Staff-controlled status transitions only.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <label className="text-xs font-medium uppercase text-slate-500">Assignment</label>
            <select
              className="h-10 w-full rounded-md border border-slate-300 px-2 text-sm"
              value={selectedAssignmentId}
              onChange={(event) => setSelectedAssignmentId(event.target.value)}
            >
              {assignments.map((assignment) => (
                <option key={assignment.id} value={assignment.id}>
                  {(assignment.candidates?.[0]?.name ?? 'Candidate') +
                    ' — ' +
                    (assignment.firms?.[0]?.name ?? 'Firm')}
                </option>
              ))}
            </select>

            <label className="text-xs font-medium uppercase text-slate-500">Status</label>
            <select
              className="h-10 w-full rounded-md border border-slate-300 px-2 text-sm"
              value={selectedStatus}
              onChange={(event) =>
                setSelectedStatus(event.target.value as (typeof FIRM_STATUSES)[number])
              }
            >
              {FIRM_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>

            <Button
              onClick={async () => {
                const { error } = await supabaseClient.functions.invoke(
                  'staff_update_assignment_status',
                  {
                    body: {
                      assignment_id: selectedAssignmentId,
                      new_status: selectedStatus,
                    },
                  },
                );

                if (error) {
                  setStatusMessage(error.message);
                } else {
                  setStatusMessage('Status updated.');
                  loadData();
                }
              }}
            >
              Update Status
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Assignment Snapshot</CardTitle>
          <CardDescription>Status-priority tracking rows for active candidates.</CardDescription>
        </CardHeader>
        <CardContent className="max-h-72 overflow-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-xs uppercase text-slate-500">
                <th className="px-2 py-2">Candidate</th>
                <th className="px-2 py-2">Firm</th>
                <th className="px-2 py-2">Status</th>
              </tr>
            </thead>
            <tbody>{assignmentRows}</tbody>
          </table>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Appointment Console + Calendar Health</CardTitle>
            <CardDescription>Review requests, edit details, and accept/decline/cancel.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex flex-wrap gap-2">
              {APPOINTMENT_STATUS_FILTERS.map((status) => (
                <Button
                  key={status}
                  size="sm"
                  variant={appointmentStatusFilter === status ? 'default' : 'outline'}
                  onClick={() => setAppointmentStatusFilter(status)}
                >
                  {statusLabel(status)}
                </Button>
              ))}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <p>Filtered appointments: {filteredAppointments.length}</p>
                <p>All appointments loaded: {appointments.length}</p>
                <p>Calendar connections: {calendarConnections.length}</p>
                <div className="max-h-72 space-y-2 overflow-auto rounded-md border border-slate-200 p-2">
                  {filteredAppointments.map((appointment) => (
                    <button
                      type="button"
                      key={appointment.id}
                      className={`w-full rounded-md border px-3 py-2 text-left ${
                        selectedAppointmentId === appointment.id
                          ? 'border-sky-700 bg-sky-50'
                          : 'border-slate-200 bg-white'
                      }`}
                      onClick={() => {
                        setSelectedAppointmentId(appointment.id);
                        setAppointmentDraft(toAppointmentDraft(appointment));
                      }}
                    >
                      <p className="font-medium text-slate-900">{appointment.title}</p>
                      <p className="text-xs text-slate-600">
                        {appointment.candidate?.[0]?.name ??
                          appointment.candidate?.[0]?.email ??
                          appointment.candidate_user_id}
                      </p>
                      <p className="text-xs text-slate-600">{appointment.start_at_utc}</p>
                      <p className="text-xs font-medium text-slate-800">
                        Status: {statusLabel(appointment.status)}
                      </p>
                    </button>
                  ))}
                  {filteredAppointments.length === 0 ? (
                    <p className="text-slate-500">No appointments in this status.</p>
                  ) : null}
                </div>
              </div>

              <div className="space-y-3 rounded-md border border-slate-200 p-3">
                {selectedAppointment && appointmentDraft ? (
                  <>
                    <p className="text-xs uppercase text-slate-500">Candidate</p>
                    <p className="text-sm font-medium text-slate-900">
                      {selectedAppointment.candidate?.[0]?.name ??
                        selectedAppointment.candidate?.[0]?.email ??
                        selectedAppointment.candidate_user_id}
                    </p>
                    <p className="text-xs text-slate-600">
                      Current status: {statusLabel(selectedAppointment.status)}
                    </p>

                    <Input
                      value={appointmentDraft.title}
                      onChange={(event) =>
                        setAppointmentDraft((current) =>
                          current ? { ...current, title: event.target.value } : current,
                        )
                      }
                      placeholder="Title"
                    />
                    <Textarea
                      rows={3}
                      value={appointmentDraft.description}
                      onChange={(event) =>
                        setAppointmentDraft((current) =>
                          current ? { ...current, description: event.target.value } : current,
                        )
                      }
                      placeholder="Description"
                    />

                    <select
                      className="h-10 w-full rounded-md border border-slate-300 px-2 text-sm"
                      value={appointmentDraft.modality}
                      onChange={(event) =>
                        setAppointmentDraft((current) =>
                          current
                            ? {
                                ...current,
                                modality: event.target.value as 'virtual' | 'in_person',
                              }
                            : current,
                        )
                      }
                    >
                      <option value="virtual">Virtual</option>
                      <option value="in_person">In-person</option>
                    </select>

                    <Input
                      value={appointmentDraft.videoUrl}
                      onChange={(event) =>
                        setAppointmentDraft((current) =>
                          current ? { ...current, videoUrl: event.target.value } : current,
                        )
                      }
                      placeholder="Video URL"
                    />
                    <Input
                      value={appointmentDraft.locationText}
                      onChange={(event) =>
                        setAppointmentDraft((current) =>
                          current ? { ...current, locationText: event.target.value } : current,
                        )
                      }
                      placeholder="Location"
                    />
                    <Input
                      value={appointmentDraft.startAtUtc}
                      onChange={(event) =>
                        setAppointmentDraft((current) =>
                          current ? { ...current, startAtUtc: event.target.value } : current,
                        )
                      }
                      placeholder="Start ISO (UTC)"
                    />
                    <Input
                      value={appointmentDraft.endAtUtc}
                      onChange={(event) =>
                        setAppointmentDraft((current) =>
                          current ? { ...current, endAtUtc: event.target.value } : current,
                        )
                      }
                      placeholder="End ISO (UTC)"
                    />
                    <Input
                      value={appointmentDraft.timezoneLabel}
                      onChange={(event) =>
                        setAppointmentDraft((current) =>
                          current ? { ...current, timezoneLabel: event.target.value } : current,
                        )
                      }
                      placeholder="Timezone label"
                    />

                    <div className="flex flex-wrap gap-2">
                      <Button
                        disabled={isSavingAppointment}
                        onClick={() => {
                          void submitAppointmentUpdate();
                        }}
                      >
                        Save edits
                      </Button>
                      <Button
                        disabled={isSavingAppointment}
                        onClick={() => {
                          void submitAppointmentUpdate('accepted');
                        }}
                      >
                        Accept
                      </Button>
                      <Button
                        variant="destructive"
                        disabled={isSavingAppointment}
                        onClick={() => {
                          void submitAppointmentUpdate('declined');
                        }}
                      >
                        Decline
                      </Button>
                      <Button
                        variant="outline"
                        disabled={isSavingAppointment}
                        onClick={() => {
                          void submitAppointmentUpdate('cancelled');
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="text-slate-500">Select an appointment to review.</p>
                )}
              </div>
            </div>

            <Button variant="secondary" onClick={loadData}>
              Refresh Snapshot
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recruiter Contact Banner Settings</CardTitle>
            <CardDescription>Global contact visible in candidate app header.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              value={contactPhone}
              onChange={(event) => setContactPhone(event.target.value)}
              placeholder="Phone"
            />
            <Input
              value={contactEmail}
              onChange={(event) => setContactEmail(event.target.value)}
              placeholder="Email"
            />
            <Button
              onClick={async () => {
                const { error } = await supabaseClient
                  .from('recruiter_contact_config')
                  .upsert(
                    {
                      id: '00000000-0000-0000-0000-000000000001',
                      phone: contactPhone,
                      email: contactEmail,
                      is_active: true,
                    },
                    { onConflict: 'id' },
                  );

                if (error) {
                  setStatusMessage(error.message);
                } else {
                  setStatusMessage('Recruiter contact updated.');
                  loadData();
                }
              }}
            >
              Save Contact
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Audit Log Viewer</CardTitle>
            <CardDescription>Recent privileged actions.</CardDescription>
          </CardHeader>
          <CardContent className="max-h-64 overflow-auto text-xs">
            <pre>{JSON.stringify(auditEvents, null, 2)}</pre>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Support Data Request Queue</CardTitle>
            <CardDescription>Internal-only export/delete handling.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {supportRequests.map((request) => (
              <div key={request.id} className="rounded-md border border-slate-200 p-2 text-sm">
                <p className="font-medium">{request.request_type.toUpperCase()}</p>
                <p className="text-slate-600">Status: {request.status}</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  onClick={async () => {
                    const { error } = await supabaseClient.functions.invoke(
                      'staff_handle_data_request',
                      {
                        body: {
                          request_id: request.id,
                          action: request.request_type,
                          notes: request.notes,
                        },
                      },
                    );

                    if (error) {
                      setStatusMessage(error.message);
                    } else {
                      setStatusMessage('Support request handled.');
                      loadData();
                    }
                  }}
                >
                  Mark Processed
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Notification / Delivery Health</CardTitle>
          <CardDescription>Push/email dispatch events are tracked in audit + delivery table.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="secondary" onClick={loadData}>
            Refresh Delivery Metrics
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
