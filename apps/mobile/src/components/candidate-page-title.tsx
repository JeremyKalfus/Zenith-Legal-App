import { Image, StyleSheet, Text, View } from 'react-native';
import { uiColors } from '../theme/colors';

const ZENITH_LOGO = require('../../assets/zenith-legal-logo.png');

export function CandidatePageTitle({ title }: { title: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.title}>{title}</Text>
      <Image source={ZENITH_LOGO} style={styles.logo} resizeMode="contain" />
    </View>
  );
}

const styles = StyleSheet.create({
  logo: {
    height: 24,
    width: 24,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  title: {
    color: uiColors.textPrimary,
    fontSize: 24,
    fontWeight: '700',
  },
});
