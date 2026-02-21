import { SafeAreaView, ScrollView, StyleSheet, View } from 'react-native';
import { GlobalRecruiterBanner } from './global-recruiter-banner';

export function ScreenShell({
  children,
  showBanner = true,
}: {
  children: React.ReactNode;
  showBanner?: boolean;
}) {
  return (
    <SafeAreaView style={styles.safeArea}>
      {showBanner ? <GlobalRecruiterBanner /> : null}
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.inner}>{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: '#F8FAFC',
    flex: 1,
  },
  content: {
    paddingBottom: 24,
  },
  inner: {
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
});
