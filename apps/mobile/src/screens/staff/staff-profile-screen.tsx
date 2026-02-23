import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ScreenShell } from '../../components/screen-shell';
import { useAuth } from '../../context/auth-context';

export function StaffProfileScreen() {
  const { isSigningOut, profile, signOut } = useAuth();

  return (
    <ScreenShell showBanner={false}>
      <Text style={styles.title}>Profile</Text>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Account</Text>
        <Text style={styles.value}>{profile?.name || 'Staff user'}</Text>
        <Text style={styles.subtle}>{profile?.email ?? 'No email available'}</Text>
        <Text style={styles.subtle}>Role: {profile?.role ?? 'staff'}</Text>
      </View>

      <Pressable
        style={[styles.logout, isSigningOut && styles.buttonDisabled]}
        disabled={isSigningOut}
        accessibilityState={{ disabled: isSigningOut }}
        onPress={() => {
          void signOut();
        }}
      >
        <Text style={styles.logoutText}>{isSigningOut ? 'Signing out...' : 'Sign out'}</Text>
      </Pressable>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  buttonDisabled: {
    opacity: 0.6,
  },
  card: {
    backgroundColor: '#ffffff',
    borderColor: '#E2E8F0',
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
    padding: 12,
  },
  logout: {
    alignItems: 'center',
    backgroundColor: '#7F1D1D',
    borderRadius: 10,
    padding: 12,
  },
  logoutText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  sectionTitle: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '700',
  },
  subtle: {
    color: '#475569',
  },
  title: {
    color: '#0F172A',
    fontSize: 24,
    fontWeight: '700',
  },
  value: {
    color: '#0F172A',
    fontSize: 18,
    fontWeight: '600',
  },
});
