import { StyleSheet, Text, View } from 'react-native';
import { CalendarSyncCard } from '../../components/calendar-sync-card';
import { ScreenShell } from '../../components/screen-shell';
import { StaffPageTitle } from '../../components/staff-page-title';
import { SignOutButton } from '../../components/sign-out-button';
import { useAuth } from '../../context/auth-context';
import { uiColors } from '../../theme/colors';

export function StaffProfileScreen() {
  const { isSigningOut, profile, signOut } = useAuth();

  return (
    <ScreenShell showBanner={false}>
      <StaffPageTitle title="Profile" />

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Account</Text>
        <Text style={styles.value}>{profile?.name || 'Recruiter user'}</Text>
        <Text style={styles.subtle}>{profile?.email ?? 'No email available'}</Text>
        <Text style={styles.subtle}>Role: Recruiter</Text>
      </View>

      <CalendarSyncCard />

      <SignOutButton
        isSigningOut={isSigningOut}
        onSignOut={() => {
          void signOut();
        }}
      />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: uiColors.surface,
    borderColor: uiColors.border,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
    padding: 12,
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
