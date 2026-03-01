import type { ReactNode } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { uiColors } from '../theme/colors';

const STAFF_HEADER_LOGO = require('../../assets/candidate-header-logo.png');

export function StaffPageTitle({
  title,
  rightContent,
}: {
  title: string;
  rightContent?: ReactNode;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.rightGroup}>
        {rightContent}
        <Image source={STAFF_HEADER_LOGO} resizeMode="contain" style={styles.logo} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  logo: {
    height: 40,
    marginTop: -2,
    width: 40,
  },
  rightGroup: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  row: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  title: {
    color: uiColors.textPrimary,
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 32,
    paddingTop: 4,
  },
});
