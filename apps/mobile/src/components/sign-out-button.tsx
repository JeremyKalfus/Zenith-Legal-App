import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { uiColors } from '../theme/colors';
import { interactivePressableStyle, sharedPressableFeedback } from '../theme/pressable';

export function SignOutButton({
  isSigningOut,
  onSignOut,
}: {
  isSigningOut: boolean;
  onSignOut: () => void;
}) {
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const onOpenConfirmModal = () => setShowConfirmModal(true);
  const onCloseConfirmModal = () => {
    if (isSigningOut) {
      return;
    }
    setShowConfirmModal(false);
  };

  const onConfirmSignOut = () => {
    setShowConfirmModal(false);
    onSignOut();
  };

  return (
    <>
      <Pressable
        style={interactivePressableStyle({
          base: styles.logout,
          disabled: isSigningOut,
          disabledStyle: styles.buttonDisabled,
          hoverStyle: sharedPressableFeedback.hover,
          focusStyle: sharedPressableFeedback.focus,
          pressedStyle: sharedPressableFeedback.pressed,
        })}
        disabled={isSigningOut}
        accessibilityState={{ disabled: isSigningOut }}
        onPress={onOpenConfirmModal}
      >
        <Text style={styles.logoutText}>{isSigningOut ? 'Signing out...' : 'Sign out'}</Text>
      </Pressable>

      <Modal
        transparent
        animationType="fade"
        visible={showConfirmModal}
        onRequestClose={onCloseConfirmModal}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Sign out?</Text>
            <Text style={styles.modalBody}>You will need to sign in again to access your account.</Text>

            <View style={styles.modalActions}>
              <Pressable
                style={interactivePressableStyle({
                  base: styles.modalCancelButton,
                  disabled: isSigningOut,
                  disabledStyle: styles.buttonDisabled,
                  hoverStyle: sharedPressableFeedback.hover,
                  focusStyle: sharedPressableFeedback.focus,
                  pressedStyle: sharedPressableFeedback.pressed,
                })}
                disabled={isSigningOut}
                accessibilityState={{ disabled: isSigningOut }}
                onPress={onCloseConfirmModal}
              >
                <Text style={styles.modalCancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={interactivePressableStyle({
                  base: styles.modalConfirmButton,
                  disabled: isSigningOut,
                  disabledStyle: styles.buttonDisabled,
                  hoverStyle: sharedPressableFeedback.hover,
                  focusStyle: sharedPressableFeedback.focus,
                  pressedStyle: sharedPressableFeedback.pressed,
                })}
                disabled={isSigningOut}
                accessibilityState={{ disabled: isSigningOut }}
                onPress={onConfirmSignOut}
              >
                <Text style={styles.modalConfirmButtonText}>
                  {isSigningOut ? 'Signing out...' : 'Sign out'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  buttonDisabled: {
    opacity: 0.6,
  },
  logout: {
    alignItems: 'center',
    backgroundColor: uiColors.errorBackground,
    borderColor: uiColors.danger,
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
  },
  logoutText: {
    color: uiColors.danger,
    fontWeight: '700',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    flex: 1,
    justifyContent: 'center',
    padding: 16,
  },
  modalBody: {
    color: uiColors.textSecondary,
    fontSize: 14,
  },
  modalCancelButton: {
    alignItems: 'center',
    backgroundColor: uiColors.surface,
    borderColor: uiColors.borderStrong,
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 96,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  modalCancelButtonText: {
    color: uiColors.textPrimary,
    fontWeight: '700',
  },
  modalCard: {
    backgroundColor: uiColors.surface,
    borderColor: uiColors.border,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
    maxWidth: 420,
    padding: 16,
    width: '100%',
  },
  modalConfirmButton: {
    alignItems: 'center',
    backgroundColor: uiColors.danger,
    borderRadius: 8,
    minWidth: 96,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  modalConfirmButtonText: {
    color: uiColors.dangerText,
    fontWeight: '700',
  },
  modalTitle: {
    color: uiColors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
});
