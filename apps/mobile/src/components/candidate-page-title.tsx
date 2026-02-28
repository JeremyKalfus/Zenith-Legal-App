import { Image, StyleSheet, Text, View } from 'react-native';
import { uiColors } from '../theme/colors';

const CANDIDATE_HEADER_LOGO = require('../../assets/candidate-header-logo.png');

export function CandidatePageTitle({ title }: { title: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.title}>{title}</Text>
      <Image source={CANDIDATE_HEADER_LOGO} resizeMode="contain" style={styles.logo} />
    </View>
  );
}

const styles = StyleSheet.create({
  logo: {
    height: 104,
    marginTop: -8,
    width: 104,
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
