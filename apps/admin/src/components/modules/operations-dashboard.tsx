'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FIRM_STATUSES } from '@zenith/shared';
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

type Appointment = {
  id: string;
  title: string;
  modality: 'virtual' | 'in_person';
  start_at_utc: string;
  end_at_utc: string;
  status: string;
  candidate_name: string;
};

type SupportRequest = {
  id: string;
  request_type: 'export' | 'delete';
  status: string;
  notes: string | null;
};

export function OperationsDashboard() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [firms, setFirms] = useState<Firm[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [auditEvents, setAuditEvents] = useState<Record<string, unknown>[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [, setCalendarConnections] = useState<Record<string, unknown>[]>([]);
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

  const { register, handleSubmit, reset } = useForm<BulkPasteInput>({
    resolver: zodResolver(bulkPasteSchema),
    defaultValues: { lines: '' },
  });

  const loadData = useCallback(async () => {
    const [candidateResult, firmResult, assignmentResult, auditResult, appointmentResult, calendarResult, supportResult, contactResult] =
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
        supabaseClient.from('appointments').select('id,title,modality,start_at_utc,end_at_utc,status,candidate:users_profile!appointments_candidate_user_id_fkey(name)').order('start_at_utc', { ascending: true }).limit(30),
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

    if (appointmentResult.data) {
      setAppointments(
        (appointmentResult.data as unknown as Array<Record<string, unknown>>).map((row) => {
          const candidate = row.candidate as { name: string } | Array<{ name: string }> | null;
          const name = Array.isArray(candidate) ? candidate[0]?.name ?? 'Unknown' : candidate?.name ?? 'Unknown';
          return {
            id: row.id as string,
            title: row.title as string,
            modality: row.modality as 'virtual' | 'in_person',
            start_at_utc: row.start_at_utc as string,
            end_at_utc: row.end_at_utc as string,
            status: row.status as string,
            candidate_name: name,
          };
        }),
      );
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
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData();
  }, [loadData]);

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

      <Card>
        <CardHeader>
          <CardTitle>Appointment Management</CardTitle>
          <CardDescription>Review and manage candidate appointment requests.</CardDescription>
        </CardHeader>
        <CardContent className="max-h-96 overflow-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-xs uppercase text-slate-500">
                <th className="px-2 py-2">Candidate</th>
                <th className="px-2 py-2">Title</th>
                <th className="px-2 py-2">Modality</th>
                <th className="px-2 py-2">Time</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {appointments.map((appointment) => (
                <tr key={appointment.id} className="border-b border-slate-100 text-sm">
                  <td className="px-2 py-2">{appointment.candidate_name}</td>
                  <td className="px-2 py-2">{appointment.title}</td>
                  <td className="px-2 py-2">{appointment.modality === 'virtual' ? 'Virtual' : 'In-person'}</td>
                  <td className="px-2 py-2 text-xs">
                    {new Date(appointment.start_at_utc).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    {' – '}
                    {new Date(appointment.end_at_utc).toLocaleString(undefined, { hour: 'numeric', minute: '2-digit' })}
                  </td>
                  <td className="px-2 py-2">
                    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                      appointment.status === 'pending' ? 'bg-amber-100 text-amber-800' :
                      appointment.status === 'accepted' ? 'bg-green-100 text-green-800' :
                      appointment.status === 'declined' ? 'bg-red-100 text-red-800' :
                      'bg-slate-100 text-slate-600'
                    }`}>
                      {appointment.status}
                    </span>
                  </td>
                  <td className="px-2 py-2">
                    {appointment.status === 'pending' ? (
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          className="bg-green-600 hover:bg-green-700"
                          onClick={async () => {
                            const { error } = await supabaseClient.functions.invoke(
                              'staff_review_appointment',
                              { body: { appointment_id: appointment.id, decision: 'accepted' } },
                            );
                            if (error) {
                              setStatusMessage(error.message);
                            } else {
                              setStatusMessage('Appointment accepted.');
                              loadData();
                            }
                          }}
                        >
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-red-300 text-red-600 hover:bg-red-50"
                          onClick={async () => {
                            const { error } = await supabaseClient.functions.invoke(
                              'staff_review_appointment',
                              { body: { appointment_id: appointment.id, decision: 'declined' } },
                            );
                            if (error) {
                              setStatusMessage(error.message);
                            } else {
                              setStatusMessage('Appointment declined.');
                              loadData();
                            }
                          }}
                        >
                          Decline
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {appointments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-2 py-4 text-center text-sm text-slate-400">
                    No appointments found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
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
