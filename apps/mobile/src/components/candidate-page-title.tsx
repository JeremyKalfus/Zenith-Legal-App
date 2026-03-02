import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { uiColors } from '../theme/colors';

const CANDIDATE_HEADER_LOGO = require('../../assets/candidate-header-logo.png');
const ZENITH_LEGAL_URL = 'https://zenithlegal.com/';

export function CandidatePageTitle({ title }: { title: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.title}>{title}</Text>
      <Pressable
        accessibilityRole="link"
        onPress={() => {
          void Linking.openURL(ZENITH_LEGAL_URL);
        }}
        style={styles.logoButton}
      >
        <Image source={CANDIDATE_HEADER_LOGO} resizeMode="contain" style={styles.logo} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  logo: {
    height: 40,
    marginRight: 0,
    marginTop: -4,
    width: 40,
  },
  logoButton: {
    borderRadius: 6,
  },
  row: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  title: {
    color: uiColors.textPrimary,
    fontSize: 56 / 2,
    fontWeight: '700',
    lineHeight: 64 / 2,
    paddingTop: 6,
  },
});
