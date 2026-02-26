import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRecruiterContact } from '../context/recruiter-contact-context';
import { uiColors } from '../theme/colors';

const ZENITH_RECRUITER_PHONE_DISPLAY = '(202) 486-3535';
const ZENITH_RECRUITER_PHONE_DIAL = '+12024863535';
const ZENITH_RECRUITER_EMAIL = 'mason@zenithlegal.com';

function toDialablePhone(phone: string): string {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, '');

  if (!digits) {
    return trimmed;
  }
  if (trimmed.startsWith('+')) {
    return `+${digits}`;
  }
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }

  return `+${digits}`;
}

export function GlobalRecruiterBanner() {
  const { contact } = useRecruiterContact();
  const dialablePhone = ZENITH_RECRUITER_PHONE_DIAL || toDialablePhone(contact.phone);
  const email = ZENITH_RECRUITER_EMAIL || contact.email;

  return (
    <View style={styles.container} accessibilityRole="header">
      <Text style={styles.title}>Zenith Legal Recruiter Contact</Text>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="link"
          onPress={() => Linking.openURL(`tel:${dialablePhone}`)}
        >
          <Text style={styles.link}>{ZENITH_RECRUITER_PHONE_DISPLAY}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="link"
          onPress={() => Linking.openURL(`mailto:${email}`)}
        >
          <Text style={styles.link}>{email}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: uiColors.bannerBackground,
    borderBottomColor: uiColors.bannerBorder,
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: {
    color: uiColors.bannerTitle,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
  },
  link: {
    color: uiColors.bannerLink,
    fontSize: 14,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
