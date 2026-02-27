import { Pressable, StyleSheet, Text } from 'react-native';
import { uiColors } from '../theme/colors';
import { interactivePressableStyle, sharedPressableFeedback } from '../theme/pressable';

export function SignOutButton({
  isSigningOut,
  onSignOut,
}: {
  isSigningOut: boolean;
  onSignOut: () => void;
}) {
  return (
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
      onPress={onSignOut}
    >
      <Text style={styles.logoutText}>{isSigningOut ? 'Signing out...' : 'Sign out'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  buttonDisabled: {
    opacity: 0.6,
  },
  logout: {
    alignItems: 'center',
    backgroundColor: uiColors.danger,
    borderRadius: 10,
    padding: 12,
  },
  logoutText: {
    color: uiColors.dangerText,
    fontWeight: '700',
  },
});
