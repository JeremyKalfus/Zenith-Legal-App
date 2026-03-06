'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabaseClient } from '@/lib/supabase-client';
import { getFunctionErrorMessage } from '@/lib/function-error';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';

type StaffAccountListItem = {
  id: string;
  name: string | null;
  email: string;
  mobile: string | null;
  onboarding_complete: boolean | null;
  created_at: string;
};

function formatCreatedAt(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

function useStaffAccountManager() {
  const [staffAccounts, setStaffAccounts] = useState<StaffAccountListItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const loadBaseData = useCallback(async () => {
    setIsLoading(true);
    setStatusMessage(null);

    const [sessionResult, staffResult] = await Promise.all([
      supabaseClient.auth.getSession(),
      supabaseClient
        .from('users_profile')
        .select('id,name,email,mobile,onboarding_complete,created_at')
        .eq('role', 'staff')
        .order('name', { ascending: true }),
    ]);

    if (sessionResult.error) {
      setStatusMessage(sessionResult.error.message);
    } else {
      setCurrentUserId(sessionResult.data.session?.user.id ?? null);
    }

    if (staffResult.error) {
      setStatusMessage((previous) => previous ?? staffResult.error?.message ?? 'Failed to load staff accounts.');
      setStaffAccounts([]);
    } else {
      const staffRows = (staffResult.data ?? []) as StaffAccountListItem[];
      setStaffAccounts(staffRows);
      setSelectedStaffId((current) =>
        staffRows.some((staffUser) => staffUser.id === current) ? current : (staffRows[0]?.id ?? ''),
      );
    }

    setIsLoading(false);
  }, []);

  useEffect(() => {
    void loadBaseData();
  }, [loadBaseData]);

  useEffect(() => {
    const channel = supabaseClient
      .channel('admin-staff-accounts-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'users_profile' },
        () => {
          void loadBaseData();
        },
      )
      .subscribe();

    return () => {
      void supabaseClient.removeChannel(channel);
    };
  }, [loadBaseData]);

  const filteredStaffAccounts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return staffAccounts;
    }

    return staffAccounts.filter((staffUser) => {
      const haystack = [staffUser.name ?? '', staffUser.email, staffUser.mobile ?? ''].join(' ').toLowerCase();
      return haystack.includes(query);
    });
  }, [searchQuery, staffAccounts]);

  const selectedStaff = useMemo(
    () => staffAccounts.find((staffUser) => staffUser.id === selectedStaffId) ?? null,
    [selectedStaffId, staffAccounts],
  );

  const handleDeleteStaff = useCallback(async () => {
    if (!selectedStaff) {
      setStatusMessage('Select a staff account before deleting.');
      return;
    }

    if (selectedStaff.id === currentUserId) {
      setStatusMessage('You cannot delete your own staff account from this workflow.');
      return;
    }

    const confirmed = window.confirm(
      `Delete staff account for ${selectedStaff.name || 'this staff user'} (${selectedStaff.email})?\n\nThis permanently removes sign-in access and preserves related records where required.`,
    );
    if (!confirmed) {
      return;
    }

    setBusyAction('delete-staff');
    setStatusMessage(null);

    try {
      const { error } = await supabaseClient.functions.invoke('staff_delete_user', {
        body: { user_id: selectedStaff.id },
      });

      if (error) {
        throw error;
      }

      await loadBaseData();
      setStatusMessage('Staff account deleted.');
    } catch (error) {
      setStatusMessage(await getFunctionErrorMessage(error));
    } finally {
      setBusyAction(null);
    }
  }, [currentUserId, loadBaseData, selectedStaff]);

  return {
    busyAction,
    currentUserId,
    filteredStaffAccounts,
    handleDeleteStaff,
    isLoading,
    searchQuery,
    selectedStaff,
    selectedStaffId,
    setSearchQuery,
    setSelectedStaffId,
    staffCount: staffAccounts.length,
    statusMessage,
  };
}

export function StaffAccountManager() {
  const ctx = useStaffAccountManager();
  const selectedIsCurrentUser = ctx.selectedStaff?.id === ctx.currentUserId;

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <Card>
        <CardHeader>
          <CardTitle>Staff Accounts</CardTitle>
          <CardDescription>Search and review recruiter accounts with admin deletion controls.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            placeholder="Search name, email, mobile"
            value={ctx.searchQuery}
            onChange={(event) => ctx.setSearchQuery(event.target.value)}
          />
          <p className="text-xs text-slate-500">{ctx.staffCount} staff account(s)</p>
          <div className="max-h-[480px] overflow-auto rounded-md border border-slate-200">
            {ctx.isLoading ? (
              <p className="p-3 text-sm text-slate-500">Loading staff accounts...</p>
            ) : ctx.filteredStaffAccounts.length === 0 ? (
              <p className="p-3 text-sm text-slate-500">No staff accounts found.</p>
            ) : (
              ctx.filteredStaffAccounts.map((staffUser) => {
                const isCurrentUser = staffUser.id === ctx.currentUserId;
                return (
                  <button
                    key={staffUser.id}
                    type="button"
                    className={[
                      'w-full border-b border-slate-100 px-3 py-3 text-left text-sm last:border-b-0',
                      staffUser.id === ctx.selectedStaffId ? 'bg-sky-50' : 'bg-white hover:bg-slate-50',
                    ].join(' ')}
                    onClick={() => ctx.setSelectedStaffId(staffUser.id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900">{staffUser.name || 'Unnamed Staff User'}</p>
                        <p className="truncate text-slate-600">{staffUser.email}</p>
                        <p className="text-xs text-slate-500">{staffUser.mobile || 'No mobile on file'}</p>
                      </div>
                      {isCurrentUser ? (
                        <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-semibold text-white">
                          You
                        </span>
                      ) : null}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>{ctx.selectedStaff?.name ?? 'Staff details'}</CardTitle>
              <CardDescription>
                {ctx.selectedStaff
                  ? `${ctx.selectedStaff.email} • ${ctx.selectedStaff.mobile || 'No mobile on file'}`
                  : 'Select a staff account to review or delete.'}
              </CardDescription>
            </div>
            <Button
              variant="destructive"
              size="sm"
              disabled={!ctx.selectedStaff || selectedIsCurrentUser || ctx.busyAction !== null}
              onClick={() => {
                void ctx.handleDeleteStaff();
              }}
            >
              {ctx.busyAction === 'delete-staff' ? 'Deleting...' : 'Delete Staff'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {ctx.statusMessage ? (
            <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              {ctx.statusMessage}
            </p>
          ) : null}

          {!ctx.selectedStaff ? (
            <p className="rounded-md border border-slate-200 p-3 text-sm text-slate-500">
              Select a staff account to view details.
            </p>
          ) : (
            <div className="space-y-3 rounded-md border border-slate-200 p-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Email</p>
                <p className="text-sm text-slate-900">{ctx.selectedStaff.email}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Mobile</p>
                <p className="text-sm text-slate-900">{ctx.selectedStaff.mobile || 'No mobile on file'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Created</p>
                <p className="text-sm text-slate-900">{formatCreatedAt(ctx.selectedStaff.created_at)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Onboarding</p>
                <p className="text-sm text-slate-900">
                  {ctx.selectedStaff.onboarding_complete ? 'Complete' : 'Incomplete'}
                </p>
              </div>
              {selectedIsCurrentUser ? (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  Self-delete is blocked here. Another staff admin must remove this account.
                </p>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
