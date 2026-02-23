import { StyleSheet, Text, View } from 'react-native';
import { ScreenShell } from '../../components/screen-shell';

export function MessagesScreen({
  showRecruiterBanner = true,
}: {
  showRecruiterBanner?: boolean;
}) {
  return (
    <ScreenShell showBanner={showRecruiterBanner}>
      <Text style={styles.title}>Messages</Text>
      <View style={styles.card}>
        <Text style={styles.body}>
          Messaging is currently available in the mobile app only.
        </Text>
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  body: {
    color: '#475569',
  },
  card: {
    backgroundColor: '#ffffff',
    borderColor: '#E2E8F0',
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  title: {
    color: '#0F172A',
    fontSize: 24,
    fontWeight: '700',
  },
});
