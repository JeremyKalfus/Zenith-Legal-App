import { Platform, SafeAreaView, ScrollView, StyleSheet, View } from 'react-native';
import { GlobalRecruiterBanner } from './global-recruiter-banner';

export function ScreenShell({
  children,
  showBanner = true,
}: {
  children: React.ReactNode;
  showBanner?: boolean;
}) {
  const content = (
    <>
      {showBanner ? <GlobalRecruiterBanner /> : null}
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <View style={styles.inner}>{children}</View>
      </ScrollView>
    </>
  );

  return (
    <SafeAreaView style={[styles.safeArea, Platform.OS === 'web' ? styles.safeAreaWeb : null]}>
      {Platform.OS === 'web' ? <View style={styles.webFrame}>{content}</View> : content}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: '#F8FAFC',
    flex: 1,
  },
  safeAreaWeb: {
    alignItems: 'center',
  },
  webFrame: {
    alignSelf: 'center',
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    borderRadius: 16,
    borderWidth: 1,
    boxShadow: '0px 8px 24px rgba(15, 23, 42, 0.06)',
    flexGrow: 1,
    flexShrink: 1,
    maxWidth: 1100,
    overflow: 'hidden',
    width: '100%',
    minWidth: 320,
  },
  content: {
    paddingBottom: 24,
  },
  inner: {
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: 16,
  },
});
