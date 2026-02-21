import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRecruiterContact } from '../context/recruiter-contact-context';

export function GlobalRecruiterBanner() {
  const { contact } = useRecruiterContact();

  return (
    <View style={styles.container} accessibilityRole="header">
      <Text style={styles.title}>Zenith Legal Recruiter Contact</Text>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          onPress={() => Linking.openURL(`tel:${contact.phone}`)}
        >
          <Text style={styles.link}>{contact.phone}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => Linking.openURL(`mailto:${contact.email}`)}
        >
          <Text style={styles.link}>{contact.email}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#041C32',
    borderBottomColor: '#0C7B93',
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: {
    color: '#EFF6FF',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  link: {
    color: '#CFFAFE',
    fontSize: 14,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
