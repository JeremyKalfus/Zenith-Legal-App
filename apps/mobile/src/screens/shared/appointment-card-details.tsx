import { Text } from 'react-native';
import { formatAppointmentDateTime } from '../../lib/date-format';

type AppointmentCardDetailsStyles = {
  cardDescription: object;
  cardDetail: object;
  cardTime: object;
};

export function AppointmentCardDetails({
  description,
  endAtUtc,
  locationText,
  modality,
  startAtUtc,
  styles,
}: {
  description: string | null;
  endAtUtc: string;
  locationText: string | null;
  modality: 'virtual' | 'in_person';
  startAtUtc: string;
  styles: AppointmentCardDetailsStyles;
}) {
  return (
    <>
      <Text style={styles.cardTime}>
        {formatAppointmentDateTime(startAtUtc)} – {formatAppointmentDateTime(endAtUtc)}
      </Text>
      <Text style={styles.cardDetail}>
        {modality === 'virtual' ? 'Virtual' : 'In-person'}
        {locationText ? ` · ${locationText}` : ''}
      </Text>
      {description ? <Text style={styles.cardDescription}>{description}</Text> : null}
    </>
  );
}
