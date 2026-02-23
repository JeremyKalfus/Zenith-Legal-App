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
      <AuthProvider>
        <RecruiterContactProvider>
          <RootNavigator />
          <StatusBar style="dark" />
        </RecruiterContactProvider>
      </AuthProvider>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    backgroundColor: '#E2E8F0',
    flex: 1,
  },
});
