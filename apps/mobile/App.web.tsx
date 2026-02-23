import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import { AuthProvider } from './src/context/auth-context';
import { RecruiterContactProvider } from './src/context/recruiter-contact-context';
import { assertRequiredEnv } from './src/config/env';
import { RootNavigator } from './src/navigation/root-navigator';

assertRequiredEnv();

export default function App() {
  return (
    <View style={styles.page}>
      <View style={styles.frame}>
        <AuthProvider>
          <RecruiterContactProvider>
            <RootNavigator />
            <StatusBar style="dark" />
          </RecruiterContactProvider>
        </AuthProvider>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    backgroundColor: '#F8FAFC',
    borderColor: '#CBD5E1',
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    maxWidth: 1040,
    overflow: 'hidden',
    width: '67%',
  },
  page: {
    alignItems: 'center',
    backgroundColor: '#E2E8F0',
    flex: 1,
    padding: 16,
  },
});
