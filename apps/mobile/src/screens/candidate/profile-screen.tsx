import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ScreenShell } from '../../components/screen-shell';
import { useAuth } from '../../context/auth-context';

export function ProfileScreen() {
  const { authNotice, isHydratingProfile, isSigningOut, profile, profileLoadError, refreshProfile, signOut } =
    useAuth();

  return (
    <ScreenShell>
      <Text style={styles.title}>Profile</Text>
      {profile ? (
        <View style={styles.card}>
          <Text style={styles.label}>Name</Text>
          <Text style={styles.value}>{profile.name}</Text>
          <Text style={styles.label}>Email</Text>
          <Text style={styles.value}>{profile.email}</Text>
          <Text style={styles.label}>Mobile</Text>
          <Text style={styles.value}>{profile.mobile}</Text>
        </View>
      ) : isHydratingProfile ? (
        <View style={styles.placeholderCard}>
          <Text style={styles.placeholderText}>Loading your profile...</Text>
        </View>
      ) : (
        <View style={styles.placeholderCard}>
          <Text style={styles.placeholderText}>
            {profileLoadError ?? 'Profile information is not available yet.'}
          </Text>
          <Pressable
            style={styles.retryButton}
            disabled={isSigningOut}
            onPress={() => {
              void refreshProfile();
            }}
          >
            <Text style={styles.retryButtonText}>Retry profile</Text>
          </Pressable>
        </View>
      )}

      {authNotice ? <Text style={styles.error}>{authNotice}</Text> : null}

      <Pressable
        style={[styles.logout, isSigningOut && styles.logoutDisabled]}
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
  error: {
    color: '#B91C1C',
    fontSize: 12,
  },
  card: {
    backgroundColor: '#ffffff',
    borderColor: '#E2E8F0',
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
    padding: 12,
  },
  label: {
    color: '#64748B',
    fontSize: 12,
    textTransform: 'uppercase',
  },
  logout: {
    alignItems: 'center',
    backgroundColor: '#7F1D1D',
    borderRadius: 10,
    padding: 12,
  },
  logoutDisabled: {
    opacity: 0.6,
  },
  logoutText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  placeholderCard: {
    backgroundColor: '#ffffff',
    borderColor: '#E2E8F0',
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
    padding: 12,
  },
  placeholderText: {
    color: '#475569',
  },
  retryButton: {
    alignItems: 'center',
    backgroundColor: '#E2E8F0',
    borderRadius: 8,
    padding: 10,
  },
  retryButtonText: {
    color: '#0F172A',
    fontWeight: '600',
  },
  title: {
    color: '#0F172A',
    fontSize: 24,
    fontWeight: '700',
  },
  value: {
    color: '#0F172A',
    fontWeight: '600',
    marginBottom: 4,
  },
});
