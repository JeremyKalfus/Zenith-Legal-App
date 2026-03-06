import { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { CalendarSyncCard } from '../../components/calendar-sync-card';
import { ScreenShell } from '../../components/screen-shell';
import { StaffPageTitle } from '../../components/staff-page-title';
import { SignOutButton } from '../../components/sign-out-button';
import { useAuth } from '../../context/auth-context';
import { uiColors } from '../../theme/colors';
import { interactivePressableStyle, sharedPressableFeedback } from '../../theme/pressable';

function useStaffProfileScreen() {
  const { authNotice, clearAuthNotice, deleteAccount, isSigningOut, profile, signOut } = useAuth();
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState('');
  const [showDeleteAccountFlow, setShowDeleteAccountFlow] = useState(false);

  useEffect(() => {
    setDeleteConfirmText('');
    setDeleteBusy(false);
    setDeleteMessage('');
    setShowDeleteAccountFlow(false);
  }, [profile?.id]);

  const onSignOut = useCallback(() => {
    void signOut();
  }, [signOut]);

  const onOpenDeleteAccountFlow = useCallback(() => {
    setDeleteConfirmText('');
    setDeleteMessage('');
    setShowDeleteAccountFlow(true);
  }, []);

  const onCloseDeleteAccountFlow = useCallback(() => {
    if (deleteBusy) {
      return;
    }
    setDeleteConfirmText('');
    setDeleteMessage('');
    setShowDeleteAccountFlow(false);
  }, [deleteBusy]);

  const onDeleteAccount = useCallback(async () => {
    setDeleteMessage('');
    clearAuthNotice();
    setDeleteBusy(true);
    try {
      await deleteAccount();
      setShowDeleteAccountFlow(false);
    } catch (error) {
      setDeleteMessage((error as Error).message);
    } finally {
      setDeleteBusy(false);
    }
  }, [clearAuthNotice, deleteAccount]);

  const deleteDisabled = deleteBusy || deleteConfirmText.trim().toUpperCase() !== 'DELETE';

  return {
    authNotice,
    deleteBusy,
    deleteConfirmText,
    deleteDisabled,
    deleteMessage,
    isSigningOut,
    onCloseDeleteAccountFlow,
    onDeleteAccount,
    onOpenDeleteAccountFlow,
    onSignOut,
    profile,
    setDeleteConfirmText,
    showDeleteAccountFlow,
  };
}

type StaffProfileHook = ReturnType<typeof useStaffProfileScreen>;

function DeleteAccountButton({ h }: { h: StaffProfileHook }) {
  return (
    <Pressable
      style={interactivePressableStyle({
        base: styles.deleteAccountButton,
        disabled: h.isSigningOut,
        disabledStyle: styles.buttonDisabled,
        hoverStyle: sharedPressableFeedback.hover,
        focusStyle: sharedPressableFeedback.focus,
        pressedStyle: sharedPressableFeedback.pressed,
      })}
      disabled={h.isSigningOut}
      accessibilityState={{ disabled: h.isSigningOut }}
      onPress={h.onOpenDeleteAccountFlow}
    >
      <Text style={styles.deleteAccountButtonText}>Delete my account</Text>
    </Pressable>
  );
}

function DeleteAccountOverlay({ h }: { h: StaffProfileHook }) {
  if (!h.showDeleteAccountFlow) {
    return null;
  }

  return (
    <Modal
      transparent
      animationType="fade"
      visible={h.showDeleteAccountFlow}
      onRequestClose={h.onCloseDeleteAccountFlow}
    >
      <View style={styles.deleteOverlayBackdrop}>
        <View style={styles.deleteOverlayContent}>
          <View style={styles.deleteOverlayPanel}>
            <Pressable
              style={interactivePressableStyle({
                base: styles.deleteOverlayBackButton,
                disabled: h.deleteBusy,
                disabledStyle: styles.buttonDisabled,
                hoverStyle: sharedPressableFeedback.hover,
                focusStyle: sharedPressableFeedback.focus,
                pressedStyle: sharedPressableFeedback.pressed,
              })}
              disabled={h.deleteBusy}
              accessibilityState={{ disabled: h.deleteBusy }}
              onPress={h.onCloseDeleteAccountFlow}
            >
              <Text style={styles.deleteOverlayBackButtonText}>{'< Back'}</Text>
            </Pressable>

            <View style={[styles.card, styles.dangerCard]}>
              <Text style={styles.sectionTitle}>Delete Account</Text>
              <Text style={styles.helper}>
                Permanently delete your recruiter account and sign-in information from the app.
              </Text>
              <Text style={styles.helper}>
                If this is the last remaining staff account, deletion will be blocked.
              </Text>
              <Text style={styles.label}>Type DELETE to confirm</Text>
              <TextInput
                autoCapitalize="characters"
                placeholder="DELETE"
                style={styles.input}
                value={h.deleteConfirmText}
                onChangeText={h.setDeleteConfirmText}
                editable={!h.deleteBusy}
              />
              <Pressable
                style={interactivePressableStyle({
                  base: styles.deleteAccountButton,
                  disabled: h.deleteDisabled,
                  disabledStyle: styles.buttonDisabled,
                  hoverStyle: sharedPressableFeedback.hover,
                  focusStyle: sharedPressableFeedback.focus,
                  pressedStyle: sharedPressableFeedback.pressed,
                })}
                disabled={h.deleteDisabled}
                accessibilityState={{ disabled: h.deleteDisabled }}
                onPress={h.onDeleteAccount}
              >
                <Text style={styles.deleteAccountButtonText}>
                  {h.deleteBusy ? 'Deleting account...' : 'Delete my account permanently'}
                </Text>
              </Pressable>
              {h.deleteMessage ? <Text style={styles.error}>{h.deleteMessage}</Text> : null}
              {h.authNotice ? <Text style={styles.error}>{h.authNotice}</Text> : null}
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function StaffProfileScreen() {
  const h = useStaffProfileScreen();

  return (
    <ScreenShell showBanner={false}>
      <StaffPageTitle title="Profile" />

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Account</Text>
        <Text style={styles.value}>{h.profile?.name || 'Recruiter user'}</Text>
        <Text style={styles.subtle}>{h.profile?.email ?? 'No email available'}</Text>
        <Text style={styles.subtle}>Role: Recruiter</Text>
      </View>

      <CalendarSyncCard />

      <SignOutButton isSigningOut={h.isSigningOut} onSignOut={h.onSignOut} />
      {h.profile ? <DeleteAccountButton h={h} /> : null}
      {h.profile ? <DeleteAccountOverlay h={h} /> : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  buttonDisabled: {
    opacity: 0.6,
  },
  card: {
    backgroundColor: uiColors.surface,
    borderColor: uiColors.border,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
    padding: 12,
  },
  dangerCard: {
    backgroundColor: uiColors.errorBackground,
    borderColor: uiColors.errorBorder,
  },
  deleteAccountButton: {
    alignItems: 'center',
    backgroundColor: uiColors.danger,
    borderRadius: 10,
    padding: 12,
  },
  deleteAccountButtonText: {
    color: uiColors.dangerText,
    fontWeight: '700',
  },
  deleteOverlayBackdrop: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    flex: 1,
  },
  deleteOverlayBackButton: {
    alignSelf: 'flex-start',
    backgroundColor: uiColors.surface,
    borderColor: uiColors.borderStrong,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  deleteOverlayBackButtonText: {
    color: uiColors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  deleteOverlayContent: {
    alignItems: 'center',
    flex: 1,
    gap: 12,
    justifyContent: 'center',
    padding: 16,
  },
  deleteOverlayPanel: {
    alignSelf: 'center',
    gap: 12,
    maxWidth: 440,
    width: '100%',
  },
  error: {
    color: uiColors.error,
    fontSize: 12,
  },
  helper: {
    color: uiColors.textMuted,
    fontSize: 12,
  },
  input: {
    backgroundColor: uiColors.surface,
    borderColor: uiColors.borderStrong,
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
  },
  label: {
    color: uiColors.textMuted,
    fontSize: 12,
    textTransform: 'uppercase',
  },
  sectionTitle: {
    color: uiColors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  subtle: {
    color: uiColors.textSecondary,
  },
  value: {
    color: uiColors.textPrimary,
    fontSize: 18,
    fontWeight: '600',
  },
});
