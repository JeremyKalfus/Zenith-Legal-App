import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FIRM_STATUSES } from '@zenith/shared';
import { ScreenShell } from '../../components/screen-shell';
import { CandidatePageTitle } from '../../components/candidate-page-title';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/auth-context';
import type { CandidateFirmAssignment } from '../../types/domain';
import { uiColors } from '../../theme/colors';
import { interactivePressableStyle, sharedPressableFeedback } from '../../theme/pressable';
import { getFirmStatusBadgeColors } from '../../features/firm-status-badge';

async function extractFunctionInvokeErrorMessage(error: unknown, data: unknown): Promise<string> {
  if (typeof data === 'object' && data && 'error' in data) {
    const message = (data as { error?: unknown }).error;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
  }

  if (typeof error === 'object' && error && 'context' in error) {
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      try {
        const json = (await context.clone().json()) as { error?: unknown; message?: unknown };
        if (typeof json.error === 'string' && json.error.trim()) {
          return json.error;
        }
        if (typeof json.message === 'string' && json.message.trim()) {
          return json.message;
        }
      } catch {
        try {
          const text = await context.clone().text();
          if (text.trim()) {
            return text;
          }
        } catch {
          // Fall through.
        }
      }
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Unable to update authorization. Please try again.';
}

function isTrackedFirmStatus(value: unknown): value is CandidateFirmAssignment['status_enum'] {
  return typeof value === 'string' && FIRM_STATUSES.includes(value as (typeof FIRM_STATUSES)[number]);
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
      .order('status_updated_at', { ascending: false });

    if (error) {
      setMessage(error.message);
      return;
    }

    const normalized: CandidateFirmAssignment[] = ((data ?? []) as Record<string, unknown>[])
      .flatMap((row) => {
        const status = row.status_enum;
        if (!isTrackedFirmStatus(status)) {
          return [];
        }

        const firmRelation = row.firms as
          | { id: string; name: string }[]
          | { id: string; name: string }
          | null;
        const firm = Array.isArray(firmRelation) ? firmRelation[0] : firmRelation;

        return [{
          id: String(row.id),
          firm_id: String(row.firm_id),
          status_enum: status,
          status_updated_at: String(row.status_updated_at),
          firms: {
            id: firm?.id ?? '',
            name: firm?.name ?? 'Unknown Firm',
          },
        }];
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
          throw new Error(await extractFunctionInvokeErrorMessage(error, data));
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
      <CandidatePageTitle title="Dashboard" />
      <Text style={styles.body}>
        Firms appear here only when they are actively in one of the tracked
        status stages.
      </Text>

      <Pressable
        style={interactivePressableStyle({
          base: styles.primaryCta,
          hoverStyle: sharedPressableFeedback.hover,
          focusStyle: sharedPressableFeedback.focus,
          pressedStyle: sharedPressableFeedback.pressed,
        })}
        onPress={onOpenMessages}
      >
        <Text style={styles.primaryCtaText}>One-click message the Zenith team</Text>
      </Pressable>

      {message ? <Text style={styles.error}>{message}</Text> : null}

      {sortedAssignments.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No firms yet</Text>
          <Text style={styles.body}>Your recruiter will assign firms soon.</Text>
        </View>
      ) : (
        sortedAssignments.map((assignment) => {
          const statusBadgeColors = getFirmStatusBadgeColors(assignment.status_enum);

          return (
            <View key={assignment.id} style={styles.card}>
                <Text style={styles.firmName}>{assignment.firms.name}</Text>
                <View
                  style={[
                    styles.statusBadge,
                    {
                      backgroundColor: statusBadgeColors.backgroundColor,
                      borderColor: statusBadgeColors.borderColor,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusBadgeText,
                      {
                        color: statusBadgeColors.textColor,
                      },
                    ]}
                  >
                    {assignment.status_enum}
                  </Text>
                </View>
                {assignment.status_enum === 'Waiting on your authorization to contact/submit' ||
                assignment.status_enum === 'Authorized, will submit soon' ? (
                  <View style={styles.authRow}>
                    {assignment.status_enum === 'Waiting on your authorization to contact/submit' ? (
                      <Pressable
                        style={interactivePressableStyle({
                          base: styles.authorizeButton,
                          disabled: busyAssignmentId === assignment.id,
                          disabledStyle: styles.buttonDisabled,
                          hoverStyle: sharedPressableFeedback.hover,
                          focusStyle: sharedPressableFeedback.focus,
                          pressedStyle: sharedPressableFeedback.pressed,
                        })}
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
                      style={interactivePressableStyle({
                        base: styles.declineButton,
                        disabled: busyAssignmentId === assignment.id,
                        disabledStyle: styles.buttonDisabled,
                        hoverStyle: sharedPressableFeedback.hover,
                        focusStyle: sharedPressableFeedback.focus,
                        pressedStyle: sharedPressableFeedback.pressed,
                      })}
                      disabled={busyAssignmentId === assignment.id}
                      onPress={() => {
                        void handleAuthorizationDecision(assignment.id, 'declined');
                      }}
                    >
                      <Text style={styles.declineText}>
                        {busyAssignmentId === assignment.id
                          ? 'Saving...'
                          : assignment.status_enum === 'Authorized, will submit soon'
                            ? 'Cancel'
                            : 'Decline'}
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
            </View>
          );
        })
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
    backgroundColor: uiColors.primary,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  authorizeText: {
    color: uiColors.primaryText,
    fontWeight: '600',
  },
  authorizedBadge: {
    opacity: 0.85,
  },
  body: {
    color: uiColors.textSecondary,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  card: {
    backgroundColor: uiColors.surface,
    borderColor: uiColors.border,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
  },
  declineButton: {
    backgroundColor: uiColors.errorBackground,
    borderColor: uiColors.errorBorder,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  declineText: {
    color: uiColors.errorDark,
    fontWeight: '600',
  },
  emptyCard: {
    backgroundColor: uiColors.surface,
    borderColor: uiColors.border,
    borderRadius: 12,
    borderStyle: 'dashed',
    borderWidth: 1,
    padding: 16,
  },
  emptyTitle: {
    color: uiColors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  error: {
    color: uiColors.error,
    fontSize: 13,
  },
  firmName: {
    color: uiColors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  primaryCta: {
    backgroundColor: uiColors.primary,
    borderRadius: 10,
    padding: 12,
  },
  primaryCtaText: {
    color: uiColors.primaryText,
    fontWeight: '700',
    textAlign: 'center',
  },
  statusBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
