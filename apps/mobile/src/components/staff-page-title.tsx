import type { ReactNode } from 'react';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { uiColors } from '../theme/colors';

const STAFF_HEADER_LOGO = require('../../assets/candidate-header-logo.png');
const ZENITH_LEGAL_URL = 'https://zenithlegal.com/';

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
        <Pressable
          accessibilityRole="link"
          onPress={() => {
            void Linking.openURL(ZENITH_LEGAL_URL);
          }}
          style={styles.logoButton}
        >
          <Image source={STAFF_HEADER_LOGO} resizeMode="contain" style={styles.logo} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  logo: {
    height: 40,
    width: 40,
  },
  logoButton: {
    borderRadius: 6,
    marginLeft: 4,
  },
  rightGroup: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  title: {
    color: uiColors.textPrimary,
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 32,
  },
});
