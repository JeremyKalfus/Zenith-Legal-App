import { Image, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const CANDIDATE_HEADER_LOGO = require('../../assets/candidate-header-logo.png');

export function CandidateCornerLogo() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === 'web' ? 12 : insets.top + 6;

  return (
    <View pointerEvents="none" style={[styles.overlay, { top: topInset }]}>
      <Image source={CANDIDATE_HEADER_LOGO} resizeMode="contain" style={styles.logo} />
    </View>
  );
}

const styles = StyleSheet.create({
  logo: {
    height: 78,
    width: 78,
  },
  overlay: {
    position: 'absolute',
    right: 14,
    zIndex: 20,
  },
});
