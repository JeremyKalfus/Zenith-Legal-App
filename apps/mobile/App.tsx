import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from './src/context/auth-context';
import { RecruiterContactProvider } from './src/context/recruiter-contact-context';
import { assertRequiredEnv } from './src/config/env';
import { RootNavigator } from './src/navigation/root-navigator';

assertRequiredEnv();

export default function App() {
  return (
    <AuthProvider>
      <RecruiterContactProvider>
        <RootNavigator />
        <StatusBar style="dark" />
      </RecruiterContactProvider>
    </AuthProvider>
  );
}
