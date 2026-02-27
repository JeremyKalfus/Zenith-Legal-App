import { useCallback, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import type { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { DURATION_OPTIONS } from './appointments-shared';

type UseAppointmentComposerOptions = {
  defaultDurationMinutes?: number;
  defaultStartOffsetMs?: number;
};

export function useAppointmentComposer(options?: UseAppointmentComposerOptions) {
  const defaultDurationMinutes = options?.defaultDurationMinutes ?? 30;
  const defaultStartOffsetMs = options?.defaultStartOffsetMs ?? 3_600_000;

  const [createStartAtLocal, setCreateStartAtLocal] = useState(
    () => new Date(Date.now() + defaultStartOffsetMs),
  );
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [createDurationMinutes, setCreateDurationMinutes] = useState(defaultDurationMinutes);
  const [showDurationPicker, setShowDurationPicker] = useState(false);

  const createEndAtLocal = useMemo(
    () => new Date(createStartAtLocal.getTime() + createDurationMinutes * 60_000),
    [createDurationMinutes, createStartAtLocal],
  );

  const selectedDurationLabel = useMemo(
    () =>
      DURATION_OPTIONS.find((option) => option.minutes === createDurationMinutes)?.label
      ?? `${createDurationMinutes} min`,
    [createDurationMinutes],
  );

  const handleStartPickerChange = useCallback((event: DateTimePickerEvent, selectedDate?: Date) => {
    if (event.type === 'dismissed') {
      setShowStartPicker(false);
      return;
    }

    if (selectedDate) {
      setCreateStartAtLocal(selectedDate);
    }

    if (Platform.OS === 'android') {
      setShowStartPicker(false);
    }
  }, []);

  const resetComposer = useCallback(() => {
    setShowStartPicker(false);
    setShowDurationPicker(false);
    setCreateStartAtLocal(new Date(Date.now() + defaultStartOffsetMs));
    setCreateDurationMinutes(defaultDurationMinutes);
  }, [defaultDurationMinutes, defaultStartOffsetMs]);

  return {
    createStartAtLocal,
    createEndAtLocal,
    createDurationMinutes,
    handleStartPickerChange,
    resetComposer,
    selectedDurationLabel,
    setCreateDurationMinutes,
    setCreateStartAtLocal,
    setShowDurationPicker,
    setShowStartPicker,
    showDurationPicker,
    showStartPicker,
  };
}
