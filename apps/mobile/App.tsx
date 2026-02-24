import { StatusBar } from 'expo-status-bar';
import { Platform, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider } from './src/context/auth-context';
import { RecruiterContactProvider } from './src/context/recruiter-contact-context';
import { assertRequiredEnv } from './src/config/env';
import { RootNavigator } from './src/navigation/root-navigator';

assertRequiredEnv();

export default function App() {
  const appContent = (
    <AuthProvider>
      <RecruiterContactProvider>
        <RootNavigator />
        <StatusBar style="dark" />
      </RecruiterContactProvider>
    </AuthProvider>
  );

  if (Platform.OS === 'web') {
    return (
      <View style={styles.webPage}>
        {appContent}
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.nativeRoot}>
      {appContent}
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  nativeRoot: {
    flex: 1,
  },
  webPage: {
    backgroundColor: '#E2E8F0',
    flex: 1,
  },
});
