import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ScreenShell } from '../../components/screen-shell';
import { useAuth } from '../../context/auth-context';

export function ProfileScreen() {
  const { profile, signOut } = useAuth();

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
      ) : null}

      <Pressable style={styles.logout} onPress={signOut}>
        <Text style={styles.logoutText}>Sign out</Text>
      </Pressable>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
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
  logoutText: {
    color: '#ffffff',
    fontWeight: '700',
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
