'use client';

import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { FIRM_STATUSES, bucketStaffAppointments, type FirmStatus } from '@zenith/shared';
import { type UseFormRegister, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { supabaseClient } from '@/lib/supabase-client';
import { bulkPasteSchema, parseFirmLines, type BulkPasteInput } from '@/schemas/ingest';
import { getFirmStatusBadgeClasses } from '@/features/firm-status-badge';
import { getFunctionErrorMessage } from '@/lib/function-error';

type Candidate = { id: string; name: string; email: string };
type Firm = { id: string; name: string };
type Assignment = {
  id: string;
  candidate_user_id: string;
  firm_id: string;
  status_enum: FirmStatus;
  candidates: Array<{ name: string }> | null;
  firms: Array<{ name: string }> | null;
};

type Appointment = {
  id: string;
  title: string;
  description: string | null;
  modality: 'virtual' | 'in_person';
  location_text: string | null;
  video_url: string | null;
  start_at_utc: string;
  end_at_utc: string;
  timezone_label: string;
  status: string;
  candidate_name: string;
  candidate_user_id: string;
  created_by_user_id: string;
};

const MINUTES_PER_HOUR = 60;
const SECONDS_PER_MINUTE = 60;
const MILLISECONDS_PER_SECOND = 1000;
const ONE_HOUR_MS = MINUTES_PER_HOUR * SECONDS_PER_MINUTE * MILLISECONDS_PER_SECOND;
type SupportRequest = {
  id: string;
  request_type: 'export' | 'delete';
  status: string;
  notes: string | null;
};

function toDateInputValue(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toTimeInputValue(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function combineDateAndTimeToIso(dateValue: string, timeValue: string): string | null {
  if (!dateValue || !timeValue) {
    return null;
  }
  const parsed = new Date(`${dateValue}T${timeValue}:00`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
}

function formatAppointmentOverview(startAtUtc: string, timezoneLabel: string): string {
  const startAt = new Date(startAtUtc);
  if (Number.isNaN(startAt.getTime())) {
    return startAtUtc;
  }

  try {
    const dateLabel = new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: timezoneLabel,
    }).format(startAt);
    const timeLabel = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: timezoneLabel,
      timeZoneName: 'short',
    }).format(startAt);
    return `${dateLabel} · ${timeLabel}`;
  } catch {
    return startAt.toISOString();
  }
}

function useOperationsDashboard() {
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
  const [appointmentCandidateId, setAppointmentCandidateId] = useState('');
  const [appointmentNote, setAppointmentNote] = useState('');
  const [appointmentModality, setAppointmentModality] = useState<'virtual' | 'in_person'>('virtual');
  const [appointmentStartAtUtc, setAppointmentStartAtUtc] = useState(
    () => new Date(Date.now() + ONE_HOUR_MS).toISOString(),
  );
  const [appointmentLocationText, setAppointmentLocationText] = useState('');
  const [appointmentVideoUrl, setAppointmentVideoUrl] = useState('');
  const [editingAppointmentId, setEditingAppointmentId] = useState<string | null>(null);
  const [actingAppointmentId, setActingAppointmentId] = useState<string | null>(null);

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
        supabaseClient
          .from('appointments')
          .select(
            'id,title,description,modality,location_text,video_url,start_at_utc,end_at_utc,timezone_label,status,candidate_user_id,created_by_user_id,candidate:users_profile!appointments_candidate_user_id_fkey(name)',
          )
          .order('start_at_utc', { ascending: true })
          .limit(100),
        supabaseClient.from('calendar_connections').select('*').limit(20),
        supabaseClient.from('support_data_requests').select('*').order('created_at', { ascending: false }).limit(20),
        supabaseClient.from('recruiter_contact_config').select('phone,email').eq('is_active', true).maybeSingle(),
      ]);

    if (candidateResult.data) {
      setCandidates(candidateResult.data as Candidate[]);
      setSelectedCandidateId((current) => current || candidateResult.data?.[0]?.id || '');
      setAppointmentCandidateId((current) => current || candidateResult.data?.[0]?.id || '');
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
      const mappedAppointments: Appointment[] = (
        appointmentResult.data as unknown as Array<Record<string, unknown>>
      ).map((row) => {
          const candidate = row.candidate as { name: string } | Array<{ name: string }> | null;
          const name = Array.isArray(candidate) ? candidate[0]?.name ?? 'Unknown' : candidate?.name ?? 'Unknown';
          return {
            id: row.id as string,
            title: row.title as string,
            description: row.description as string | null,
            modality: row.modality as 'virtual' | 'in_person',
            location_text: row.location_text as string | null,
            video_url: row.video_url as string | null,
            start_at_utc: row.start_at_utc as string,
            end_at_utc: row.end_at_utc as string,
            timezone_label: (row.timezone_label as string | null) ?? 'America/New_York',
            status: row.status as string,
            candidate_name: name,
            candidate_user_id: row.candidate_user_id as string,
            created_by_user_id: row.created_by_user_id as string,
          };
        });
      setAppointments(mappedAppointments);
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

  useEffect(() => {
    const channel = supabaseClient
      .channel('admin-appointments-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appointments' },
        () => {
          void loadData();
        },
      )
      .subscribe();

    return () => {
      void supabaseClient.removeChannel(channel);
    };
  }, [loadData]);

  const assignmentRows = useMemo(
    () =>
      assignments.map((assignment) => (
        <tr key={assignment.id} className="border-b border-slate-100 text-sm">
          <td className="px-2 py-2">
            {assignment.candidates?.[0]?.name ?? 'Candidate'}
          </td>
          <td className="px-2 py-2">{assignment.firms?.[0]?.name ?? 'Firm'}</td>
          <td className="px-2 py-2">
            <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${getFirmStatusBadgeClasses(assignment.status_enum)}`}>
              {assignment.status_enum}
            </span>
          </td>
        </tr>
      )),
    [assignments],
  );

  const appointmentSections = useMemo(
    () => bucketStaffAppointments(appointments),
    [appointments],
  );

  const handleCreateFirm = useCallback(async () => {
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
  }, [newFirmName, loadData]);

  const handleBulkPaste = useMemo(
    () =>
      handleSubmit(async (values) => {
        const parsed = parseFirmLines(values.lines);
        const { data, error } = await supabaseClient.functions.invoke(
          'bulk_paste_ingest_firms',
          { body: { rows: parsed } },
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
      }),
    [handleSubmit, reset, loadData],
  );

  const handleAssignFirm = useCallback(async () => {
    const { error } = await supabaseClient.functions.invoke(
      'assign_firm_to_candidate',
      { body: { candidate_id: selectedCandidateId, firm_id: selectedFirmId } },
    );

    if (error) {
      setStatusMessage(error.message);
    } else {
      setStatusMessage('Assignment created.');
      loadData();
    }
  }, [selectedCandidateId, selectedFirmId, loadData]);

  const handleUpdateStatus = useCallback(async () => {
    const { error } = await supabaseClient.functions.invoke(
      'staff_update_assignment_status',
      { body: { assignment_id: selectedAssignmentId, new_status: selectedStatus } },
    );

    if (error) {
      setStatusMessage(error.message);
    } else {
      setStatusMessage('Status updated.');
      loadData();
    }
  }, [selectedAssignmentId, selectedStatus, loadData]);

  const resetAppointmentForm = useCallback(() => {
    setAppointmentNote('');
    setAppointmentModality('virtual');
    setAppointmentStartAtUtc(new Date(Date.now() + ONE_HOUR_MS).toISOString());
    setAppointmentLocationText('');
    setAppointmentVideoUrl('');
    setEditingAppointmentId(null);
  }, []);

  const handleSubmitAppointment = useCallback(async () => {
    if (!appointmentCandidateId) {
      setStatusMessage('Select a candidate before scheduling.');
      return;
    }
    const timezoneLabel = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';
    const { error } = await supabaseClient.functions.invoke('schedule_or_update_appointment', {
      body: {
        id: editingAppointmentId ?? undefined,
        candidateUserId: appointmentCandidateId,
        note: appointmentNote.trim() || undefined,
        modality: appointmentModality,
        locationText:
          appointmentModality === 'in_person' ? appointmentLocationText.trim() || undefined : undefined,
        videoUrl: appointmentModality === 'virtual' ? appointmentVideoUrl.trim() || undefined : undefined,
        startAtUtc: appointmentStartAtUtc,
        timezoneLabel,
        status: 'scheduled',
      },
    });

    if (error) {
      setStatusMessage(await getFunctionErrorMessage(error));
      return;
    }

    setStatusMessage(editingAppointmentId ? 'Appointment updated.' : 'Appointment scheduled.');
    resetAppointmentForm();
    await loadData();
  }, [
    editingAppointmentId,
    appointmentCandidateId,
    appointmentNote,
    appointmentLocationText,
    appointmentModality,
    appointmentStartAtUtc,
    appointmentVideoUrl,
    loadData,
    resetAppointmentForm,
  ]);

  const handleLifecycleAction = useCallback(
    async (
      appointmentId: string,
      action: 'ignore_overdue' | 'cancel_outgoing_request' | 'cancel_upcoming',
      successMessage: string,
    ) => {
      setActingAppointmentId(appointmentId);
      const { error } = await supabaseClient.functions.invoke('manage_appointment_lifecycle', {
        body: {
          appointment_id: appointmentId,
          action,
        },
      });

      if (error) {
        setStatusMessage(await getFunctionErrorMessage(error));
        setActingAppointmentId(null);
        return;
      }

      setStatusMessage(successMessage);
      setActingAppointmentId(null);
      await loadData();
    },
    [loadData],
  );

  const startEditAppointment = useCallback((appointment: Appointment) => {
    setEditingAppointmentId(appointment.id);
    setAppointmentCandidateId(appointment.candidate_user_id);
    setAppointmentNote(appointment.description ?? '');
    setAppointmentModality(appointment.modality);
    setAppointmentStartAtUtc(appointment.start_at_utc);
    setAppointmentLocationText(appointment.location_text ?? '');
    setAppointmentVideoUrl(appointment.video_url ?? '');
  }, []);

  const handleSaveContact = useCallback(async () => {
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
  }, [contactPhone, contactEmail, loadData]);

  const handleProcessSupportRequest = useCallback(
    async (request: SupportRequest) => {
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
    },
    [loadData],
  );

  return {
    candidates,
    firms,
    assignments,
    auditEvents,
    appointments,
    appointmentSections,
    supportRequests,
    selectedCandidateId,
    setSelectedCandidateId,
    selectedFirmId,
    setSelectedFirmId,
    selectedAssignmentId,
    setSelectedAssignmentId,
    selectedStatus,
    setSelectedStatus,
    contactPhone,
    setContactPhone,
    contactEmail,
    setContactEmail,
    appointmentCandidateId,
    setAppointmentCandidateId,
    appointmentNote,
    setAppointmentNote,
    appointmentModality,
    setAppointmentModality,
    appointmentStartAtUtc,
    setAppointmentStartAtUtc,
    appointmentLocationText,
    setAppointmentLocationText,
    appointmentVideoUrl,
    setAppointmentVideoUrl,
    editingAppointmentId,
    actingAppointmentId,
    statusMessage,
    newFirmName,
    setNewFirmName,
    register,
    assignmentRows,
    loadData,
    handleCreateFirm,
    handleBulkPaste,
    handleAssignFirm,
    handleUpdateStatus,
    handleSubmitAppointment,
    handleLifecycleAction,
    startEditAppointment,
    resetAppointmentForm,
    handleSaveContact,
    handleProcessSupportRequest,
  };
}

function CandidateDirectoryCard({ candidates }: { candidates: Candidate[] }) {
  return (
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
  );
}

function FirmIngestCard({
  newFirmName,
  setNewFirmName,
  handleCreateFirm,
  handleBulkPaste,
  register,
}: {
  newFirmName: string;
  setNewFirmName: (v: string) => void;
  handleCreateFirm: () => void;
  handleBulkPaste: (e: React.FormEvent) => void;
  register: UseFormRegister<BulkPasteInput>;
}) {
  return (
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
          <Button onClick={handleCreateFirm}>Add</Button>
        </div>
        <form className="space-y-2" onSubmit={handleBulkPaste}>
          <Textarea
            rows={7}
            placeholder="Paste one law firm per line"
            {...register('lines')}
          />
          <Button type="submit">Run Bulk Paste Import</Button>
        </form>
      </CardContent>
    </Card>
  );
}

function AssignmentManagerCard({
  candidates,
  firms,
  selectedCandidateId,
  setSelectedCandidateId,
  selectedFirmId,
  setSelectedFirmId,
  handleAssignFirm,
}: {
  candidates: Candidate[];
  firms: Firm[];
  selectedCandidateId: string;
  setSelectedCandidateId: (v: string) => void;
  selectedFirmId: string;
  setSelectedFirmId: (v: string) => void;
  handleAssignFirm: () => void;
}) {
  return (
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

        <Button onClick={handleAssignFirm}>Assign Firm</Button>
      </CardContent>
    </Card>
  );
}

function StatusUpdateCard({
  assignments,
  selectedAssignmentId,
  setSelectedAssignmentId,
  selectedStatus,
  setSelectedStatus,
  handleUpdateStatus,
}: {
  assignments: Assignment[];
  selectedAssignmentId: string;
  setSelectedAssignmentId: (v: string) => void;
  selectedStatus: (typeof FIRM_STATUSES)[number];
  setSelectedStatus: (v: (typeof FIRM_STATUSES)[number]) => void;
  handleUpdateStatus: () => void;
}) {
  return (
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
                ' \u2014 ' +
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

        <Button onClick={handleUpdateStatus}>Update Status</Button>
      </CardContent>
    </Card>
  );
}

function AppointmentManagementCard({
  candidates,
  appointmentCandidateId,
  setAppointmentCandidateId,
  appointmentNote,
  setAppointmentNote,
  appointmentModality,
  setAppointmentModality,
  appointmentStartAtUtc,
  setAppointmentStartAtUtc,
  appointmentLocationText,
  setAppointmentLocationText,
  appointmentVideoUrl,
  setAppointmentVideoUrl,
  editingAppointmentId,
  actingAppointmentId,
  handleSubmitAppointment,
  overdueAppointments,
  upcomingAppointments,
  handleLifecycleAction,
  startEditAppointment,
}: {
  candidates: Candidate[];
  appointmentCandidateId: string;
  setAppointmentCandidateId: (v: string) => void;
  appointmentNote: string;
  setAppointmentNote: (v: string) => void;
  appointmentModality: 'virtual' | 'in_person';
  setAppointmentModality: (v: 'virtual' | 'in_person') => void;
  appointmentStartAtUtc: string;
  setAppointmentStartAtUtc: (v: string) => void;
  appointmentLocationText: string;
  setAppointmentLocationText: (v: string) => void;
  appointmentVideoUrl: string;
  setAppointmentVideoUrl: (v: string) => void;
  editingAppointmentId: string | null;
  actingAppointmentId: string | null;
  handleSubmitAppointment: () => void;
  overdueAppointments: Appointment[];
  upcomingAppointments: Appointment[];
  handleLifecycleAction: (
    id: string,
    action: 'ignore_overdue' | 'cancel_outgoing_request' | 'cancel_upcoming',
    successMessage: string,
  ) => void;
  startEditAppointment: (appointment: Appointment) => void;
}) {
  const hasSections =
    overdueAppointments.length > 0 || upcomingAppointments.length > 0;
  const appointmentDateValue = toDateInputValue(appointmentStartAtUtc);
  const appointmentTimeValue = toTimeInputValue(appointmentStartAtUtc);
  const [expandedNotes, setExpandedNotes] = useState<Record<string, boolean>>({});

  return (
    <Card>
      <CardHeader>
        <CardTitle>Appointment Management</CardTitle>
        <CardDescription>Overdue and upcoming appointments.</CardDescription>
      </CardHeader>
      <CardContent className="max-h-96 space-y-4 overflow-auto">
        <div className="space-y-2 rounded-md border border-slate-200 p-3">
          <p className="text-xs font-medium uppercase text-slate-500">
            {editingAppointmentId ? 'Modify upcoming appointment' : 'Schedule for candidate'}
          </p>
          <select
            className="h-10 w-full rounded-md border border-slate-300 px-2 text-sm"
            value={appointmentCandidateId}
            onChange={(event) => setAppointmentCandidateId(event.target.value)}
          >
            {candidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
              </option>
            ))}
          </select>
          <select
            className="h-10 w-full rounded-md border border-slate-300 px-2 text-sm"
            value={appointmentModality}
            onChange={(event) => setAppointmentModality(event.target.value as 'virtual' | 'in_person')}
          >
            <option value="virtual">Virtual</option>
            <option value="in_person">In-person</option>
          </select>
          <Input
            type="date"
            value={appointmentDateValue}
            onChange={(event) => {
              const nextIso = combineDateAndTimeToIso(event.target.value, appointmentTimeValue);
              if (nextIso) {
                setAppointmentStartAtUtc(nextIso);
              }
            }}
            placeholder="Date"
          />
          <Input
            type="time"
            value={appointmentTimeValue}
            onChange={(event) => {
              const nextIso = combineDateAndTimeToIso(appointmentDateValue, event.target.value);
              if (nextIso) {
                setAppointmentStartAtUtc(nextIso);
              }
            }}
            placeholder="Time"
          />
          {appointmentModality === 'in_person' ? (
            <Input
              value={appointmentLocationText}
              onChange={(event) => setAppointmentLocationText(event.target.value)}
              placeholder="Location (optional)"
            />
          ) : null}
          {appointmentModality === 'virtual' ? (
            <Input
              value={appointmentVideoUrl}
              onChange={(event) => setAppointmentVideoUrl(event.target.value)}
              placeholder="Video URL (optional)"
            />
          ) : null}
          <Textarea
            value={appointmentNote}
            onChange={(event) => setAppointmentNote(event.target.value)}
            placeholder="Note (optional)"
            rows={3}
          />
          <Button onClick={handleSubmitAppointment}>
            {editingAppointmentId ? 'Save Changes' : 'Schedule Appointment'}
          </Button>
        </div>
        {overdueAppointments.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase text-red-700">
              Overdue ({overdueAppointments.length})
            </p>
            {overdueAppointments.map((appointment) => (
              <div key={appointment.id} className="rounded-md border border-red-200 p-3 text-sm">
                <p className="font-medium text-slate-900">
                  {appointment.candidate_name} · {formatAppointmentOverview(appointment.start_at_utc, appointment.timezone_label)}
                </p>
                <p className="text-xs text-slate-500">
                  {appointment.modality === 'virtual' ? 'Virtual' : 'In-person'}
                  {appointment.modality === 'virtual' && appointment.video_url ? ` · ${appointment.video_url}` : ''}
                  {appointment.modality === 'in_person' && appointment.location_text ? ` · ${appointment.location_text}` : ''}
                </p>
                <p
                  className="mt-1 whitespace-pre-wrap text-slate-600"
                  style={expandedNotes[appointment.id]
                    ? undefined
                    : { WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, display: '-webkit-box', overflow: 'hidden' }}
                >
                  Note: {appointment.description?.trim() || 'No note'}
                </p>
                <button
                  type="button"
                  className="mt-1 text-xs font-semibold text-blue-600 hover:underline"
                  onClick={() =>
                    setExpandedNotes((current) => ({
                      ...current,
                      [appointment.id]: !current[appointment.id],
                    }))
                  }
                >
                  {expandedNotes[appointment.id] ? 'See less' : 'See more'}
                </button>
                <div className="mt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-slate-300"
                    disabled={actingAppointmentId === appointment.id}
                    onClick={() =>
                      handleLifecycleAction(appointment.id, 'ignore_overdue', 'Overdue appointment ignored.')
                    }
                  >
                    {actingAppointmentId === appointment.id ? 'Ignoring...' : 'Ignore'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {upcomingAppointments.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase text-slate-700">
              Upcoming Appointments ({upcomingAppointments.length})
            </p>
            {upcomingAppointments.map((appointment) => (
              <div key={appointment.id} className="rounded-md border border-slate-200 p-3 text-sm">
                <p className="font-medium text-slate-900">
                  {appointment.candidate_name} · {formatAppointmentOverview(appointment.start_at_utc, appointment.timezone_label)}
                </p>
                <p className="text-xs text-slate-500">
                  {appointment.modality === 'virtual' ? 'Virtual' : 'In-person'}
                  {appointment.modality === 'virtual' && appointment.video_url ? ` · ${appointment.video_url}` : ''}
                  {appointment.modality === 'in_person' && appointment.location_text ? ` · ${appointment.location_text}` : ''}
                </p>
                <p
                  className="mt-1 whitespace-pre-wrap text-slate-600"
                  style={expandedNotes[appointment.id]
                    ? undefined
                    : { WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, display: '-webkit-box', overflow: 'hidden' }}
                >
                  Note: {appointment.description?.trim() || 'No note'}
                </p>
                <button
                  type="button"
                  className="mt-1 text-xs font-semibold text-blue-600 hover:underline"
                  onClick={() =>
                    setExpandedNotes((current) => ({
                      ...current,
                      [appointment.id]: !current[appointment.id],
                    }))
                  }
                >
                  {expandedNotes[appointment.id] ? 'See less' : 'See more'}
                </button>
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => startEditAppointment(appointment)}
                  >
                    Modify
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-red-300 text-red-600 hover:bg-red-50"
                    disabled={actingAppointmentId === appointment.id}
                    onClick={() =>
                      handleLifecycleAction(appointment.id, 'cancel_upcoming', 'Upcoming appointment canceled.')
                    }
                  >
                    {actingAppointmentId === appointment.id ? 'Canceling...' : 'Cancel'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {!hasSections ? (
          <div className="rounded-md border border-slate-200 px-3 py-4 text-sm text-slate-500">
            No appointments in these sections.
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ContactSettingsCard({
  contactPhone,
  setContactPhone,
  contactEmail,
  setContactEmail,
  handleSaveContact,
}: {
  contactPhone: string;
  setContactPhone: (v: string) => void;
  contactEmail: string;
  setContactEmail: (v: string) => void;
  handleSaveContact: () => void;
}) {
  return (
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
        <Button onClick={handleSaveContact}>Save Contact</Button>
      </CardContent>
    </Card>
  );
}

function SupportRequestCard({
  supportRequests,
  handleProcessSupportRequest,
}: {
  supportRequests: SupportRequest[];
  handleProcessSupportRequest: (request: SupportRequest) => void;
}) {
  return (
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
              onClick={() => handleProcessSupportRequest(request)}
            >
              Mark Processed
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function AssignmentSnapshotCard({ assignmentRows }: { assignmentRows: ReactNode }) {
  return (
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
  );
}

export function OperationsDashboard() {
  const {
    candidates,
    firms,
    assignments,
    auditEvents,
    appointmentSections,
    supportRequests,
    selectedCandidateId,
    setSelectedCandidateId,
    selectedFirmId,
    setSelectedFirmId,
    selectedAssignmentId,
    setSelectedAssignmentId,
    selectedStatus,
    setSelectedStatus,
    contactPhone,
    setContactPhone,
    contactEmail,
    setContactEmail,
    appointmentCandidateId,
    setAppointmentCandidateId,
    appointmentNote,
    setAppointmentNote,
    appointmentModality,
    setAppointmentModality,
    appointmentStartAtUtc,
    setAppointmentStartAtUtc,
    appointmentLocationText,
    setAppointmentLocationText,
    appointmentVideoUrl,
    setAppointmentVideoUrl,
    editingAppointmentId,
    actingAppointmentId,
    statusMessage,
    newFirmName,
    setNewFirmName,
    register,
    assignmentRows,
    loadData,
    handleCreateFirm,
    handleBulkPaste,
    handleAssignFirm,
    handleUpdateStatus,
    handleSubmitAppointment,
    handleLifecycleAction,
    startEditAppointment,
    handleSaveContact,
    handleProcessSupportRequest,
  } = useOperationsDashboard();

  return (
    <div className="space-y-4">
      {statusMessage ? (
        <p className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
          {statusMessage}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <CandidateDirectoryCard candidates={candidates} />
        <FirmIngestCard
          newFirmName={newFirmName}
          setNewFirmName={setNewFirmName}
          handleCreateFirm={handleCreateFirm}
          handleBulkPaste={handleBulkPaste}
          register={register}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <AssignmentManagerCard
          candidates={candidates}
          firms={firms}
          selectedCandidateId={selectedCandidateId}
          setSelectedCandidateId={setSelectedCandidateId}
          selectedFirmId={selectedFirmId}
          setSelectedFirmId={setSelectedFirmId}
          handleAssignFirm={handleAssignFirm}
        />
        <StatusUpdateCard
          assignments={assignments}
          selectedAssignmentId={selectedAssignmentId}
          setSelectedAssignmentId={setSelectedAssignmentId}
          selectedStatus={selectedStatus}
          setSelectedStatus={setSelectedStatus}
          handleUpdateStatus={handleUpdateStatus}
        />
      </div>

      <AssignmentSnapshotCard assignmentRows={assignmentRows} />

      <AppointmentManagementCard
        candidates={candidates}
        appointmentCandidateId={appointmentCandidateId}
        setAppointmentCandidateId={setAppointmentCandidateId}
        appointmentNote={appointmentNote}
        setAppointmentNote={setAppointmentNote}
        appointmentModality={appointmentModality}
        setAppointmentModality={setAppointmentModality}
        appointmentStartAtUtc={appointmentStartAtUtc}
        setAppointmentStartAtUtc={setAppointmentStartAtUtc}
        appointmentLocationText={appointmentLocationText}
        setAppointmentLocationText={setAppointmentLocationText}
        appointmentVideoUrl={appointmentVideoUrl}
        setAppointmentVideoUrl={setAppointmentVideoUrl}
        editingAppointmentId={editingAppointmentId}
        actingAppointmentId={actingAppointmentId}
        handleSubmitAppointment={handleSubmitAppointment}
        overdueAppointments={appointmentSections.overdueConfirmed}
        upcomingAppointments={appointmentSections.upcomingAppointments}
        handleLifecycleAction={handleLifecycleAction}
        startEditAppointment={startEditAppointment}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <ContactSettingsCard
          contactPhone={contactPhone}
          setContactPhone={setContactPhone}
          contactEmail={contactEmail}
          setContactEmail={setContactEmail}
          handleSaveContact={handleSaveContact}
        />
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

        <SupportRequestCard
          supportRequests={supportRequests}
          handleProcessSupportRequest={handleProcessSupportRequest}
        />
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
