import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

type AppointmentCardDetailsStyles = {
  cardDetail: object;
  cardMeta: object;
  cardNote: object;
  seeMoreButton: object;
  seeMoreText: object;
};

function formatAppointmentDateLabel(iso: string, timezoneLabel: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: timezoneLabel,
  });
}

function formatAppointmentTimeLabel(iso: string, timezoneLabel: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezoneLabel,
    timeZoneName: 'short',
  });
}

export function AppointmentCardDetails({
  candidateLabel,
  description,
  locationText,
  metaVariant = 'full',
  modality,
  startAtUtc,
  styles,
  timezoneLabel,
  videoUrl,
}: {
  candidateLabel?: string;
  description: string | null;
  locationText: string | null;
  metaVariant?: 'full' | 'time_only';
  modality: 'virtual' | 'in_person';
  startAtUtc: string;
  styles: AppointmentCardDetailsStyles;
  timezoneLabel: string;
  videoUrl: string | null;
}) {
  const [expanded, setExpanded] = useState(false);

  const note = useMemo(() => description?.trim() || 'No note', [description]);
  const metaLine = metaVariant === 'time_only'
    ? formatAppointmentTimeLabel(startAtUtc, timezoneLabel)
    : candidateLabel?.trim()
      ? `${candidateLabel} · ${formatAppointmentDateLabel(startAtUtc, timezoneLabel)} · ${formatAppointmentTimeLabel(startAtUtc, timezoneLabel)}`
      : `${formatAppointmentDateLabel(startAtUtc, timezoneLabel)} · ${formatAppointmentTimeLabel(startAtUtc, timezoneLabel)}`;
  const detailLine =
    modality === 'virtual'
      ? `Virtual${videoUrl ? ` · ${videoUrl}` : ''}`
      : `In-person${locationText ? ` · ${locationText}` : ''}`;

  return (
    <View>
      <Text style={styles.cardMeta}>{metaLine}</Text>
      <Text style={styles.cardDetail}>{detailLine}</Text>
      <Text style={styles.cardNote} numberOfLines={expanded ? undefined : 2}>
        Note: {note}
      </Text>
      <Pressable style={styles.seeMoreButton} onPress={() => setExpanded((value) => !value)}>
        <Text style={styles.seeMoreText}>{expanded ? 'See less' : 'See more'}</Text>
      </Pressable>
    </View>
  );
}
