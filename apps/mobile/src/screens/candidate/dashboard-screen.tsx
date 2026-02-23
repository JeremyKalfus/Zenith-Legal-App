import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FIRM_STATUSES } from '@zenith/shared';
import { ScreenShell } from '../../components/screen-shell';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/auth-context';
import type { CandidateFirmAssignment } from '../../types/domain';

function extractFunctionInvokeErrorMessage(error: unknown, data: unknown): string {
  if (typeof data === 'object' && data && 'error' in data) {
    const message = (data as { error?: unknown }).error;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Unable to update authorization. Please try again.';
}

const statusRank = Object.fromEntries(
  FIRM_STATUSES.map((status, index) => [status, index]),
) as Record<string, number>;

export function DashboardScreen({
  onOpenMessages,
}: {
  onOpenMessages: () => void;
}) {
  const { session } = useAuth();
  const [assignments, setAssignments] = useState<CandidateFirmAssignment[]>([]);
  const [message, setMessage] = useState('');
  const [busyAssignmentId, setBusyAssignmentId] = useState<string | null>(null);

  const loadAssignments = useCallback(async () => {
    if (!session?.user.id) {
      return;
    }

    const { data, error } = await supabase
      .from('candidate_firm_assignments')
      .select('id,firm_id,status_enum,status_updated_at,firms(id,name)')
      .eq('candidate_user_id', session.user.id)
      .in('status_enum', [...FIRM_STATUSES]);

    if (error) {
      setMessage(error.message);
      return;
    }

    const normalized: CandidateFirmAssignment[] = ((data ??
      []) as Record<string, unknown>[]).map((row) => {
      const firmRelation = row.firms as
        | { id: string; name: string }[]
        | { id: string; name: string }
        | null;
      const firm = Array.isArray(firmRelation) ? firmRelation[0] : firmRelation;

      return {
        id: String(row.id),
        firm_id: String(row.firm_id),
        status_enum: row.status_enum as CandidateFirmAssignment['status_enum'],
        status_updated_at: String(row.status_updated_at),
        firms: {
          id: firm?.id ?? '',
          name: firm?.name ?? 'Unknown Firm',
        },
      };
    });

    setAssignments(normalized);
    setMessage('');
  }, [session?.user.id]);

  useEffect(() => {
    loadAssignments();
  }, [loadAssignments]);

  const handleAuthorizationDecision = useCallback(
    async (assignmentId: string, decision: 'authorized' | 'declined') => {
      setBusyAssignmentId(assignmentId);
      setMessage('');

      try {
        const { data, error } = await supabase.functions.invoke('authorize_firm_submission', {
          body: {
            assignment_id: assignmentId,
            decision,
          },
        });

        if (error) {
          throw new Error(extractFunctionInvokeErrorMessage(error, data));
        }

        await loadAssignments();
      } catch (error) {
        setMessage((error as Error).message);
      } finally {
        setBusyAssignmentId((current) => (current === assignmentId ? null : current));
      }
    },
    [loadAssignments],
  );

  const sortedAssignments = useMemo(
    () =>
      [...assignments].sort((a, b) => {
        const rankDifference =
          statusRank[a.status_enum] - statusRank[b.status_enum];
        if (rankDifference !== 0) {
          return rankDifference;
        }

        return (
          new Date(b.status_updated_at).getTime() -
          new Date(a.status_updated_at).getTime()
        );
      }),
    [assignments],
  );

  return (
    <ScreenShell>
      <Text style={styles.title}>Dashboard</Text>
      <Text style={styles.body}>
        Firms appear here only when they are actively in one of the tracked
        status stages.
      </Text>

      <Pressable style={styles.primaryCta} onPress={onOpenMessages}>
        <Text style={styles.primaryCtaText}>One-click message the Zenith team</Text>
      </Pressable>

      {message ? <Text style={styles.error}>{message}</Text> : null}

      {sortedAssignments.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No firms yet</Text>
          <Text style={styles.body}>Your recruiter will assign firms soon.</Text>
        </View>
      ) : (
        sortedAssignments.map((assignment) => (
          <View key={assignment.id} style={styles.card}>
            <Text style={styles.firmName}>{assignment.firms.name}</Text>
            <Text style={styles.status}>{assignment.status_enum}</Text>
            {assignment.status_enum === 'Waiting on your authorization to contact/submit' ||
            assignment.status_enum === 'Authorized, will submit soon' ? (
              <View style={styles.authRow}>
                {assignment.status_enum === 'Waiting on your authorization to contact/submit' ? (
                  <Pressable
                    style={[
                      styles.authorizeButton,
                      busyAssignmentId === assignment.id && styles.buttonDisabled,
                    ]}
                    disabled={busyAssignmentId === assignment.id}
                    onPress={() => {
                      void handleAuthorizationDecision(assignment.id, 'authorized');
                    }}
                  >
                    <Text style={styles.authorizeText}>
                      {busyAssignmentId === assignment.id ? 'Saving...' : 'Authorize'}
                    </Text>
                  </Pressable>
                ) : (
                  <View style={[styles.authorizeButton, styles.authorizedBadge, styles.buttonDisabled]}>
                    <Text style={styles.authorizeText}>Authorized</Text>
                  </View>
                )}
                <Pressable
                  style={[
                    styles.declineButton,
                    busyAssignmentId === assignment.id && styles.buttonDisabled,
                  ]}
                  disabled={busyAssignmentId === assignment.id}
                  onPress={() => {
                    void handleAuthorizationDecision(assignment.id, 'declined');
                  }}
                >
                  <Text style={styles.declineText}>
                    {busyAssignmentId === assignment.id ? 'Saving...' : 'Decline'}
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        ))
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  authRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  authorizeButton: {
    backgroundColor: '#0F766E',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  authorizeText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  authorizedBadge: {
    opacity: 0.85,
  },
  body: {
    color: '#475569',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  card: {
    backgroundColor: '#ffffff',
    borderColor: '#E2E8F0',
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
  },
  declineButton: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  declineText: {
    color: '#991B1B',
    fontWeight: '600',
  },
  emptyCard: {
    backgroundColor: '#ffffff',
    borderColor: '#E2E8F0',
    borderRadius: 12,
    borderStyle: 'dashed',
    borderWidth: 1,
    padding: 16,
  },
  emptyTitle: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  error: {
    color: '#B91C1C',
    fontSize: 13,
  },
  firmName: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '700',
  },
  primaryCta: {
    backgroundColor: '#0C4A6E',
    borderRadius: 10,
    padding: 12,
  },
  primaryCtaText: {
    color: '#F8FAFC',
    fontWeight: '700',
    textAlign: 'center',
  },
  status: {
    color: '#0F766E',
    marginTop: 6,
  },
  title: {
    color: '#0F172A',
    fontSize: 24,
    fontWeight: '700',
  },
});
