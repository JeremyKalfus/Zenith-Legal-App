import { useCallback, useState } from 'react';
import { Platform } from 'react-native';
import type { DateTimePickerEvent } from '@react-native-community/datetimepicker';

type UseAppointmentComposerOptions = {
  defaultStartOffsetMs?: number;
};

export function formatDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatTimeInputValue(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function useAppointmentComposer(options?: UseAppointmentComposerOptions) {
  const defaultStartOffsetMs = options?.defaultStartOffsetMs ?? 3_600_000;

  const [createStartAtLocal, setCreateStartAtLocal] = useState(
    () => new Date(Date.now() + defaultStartOffsetMs),
  );
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const handleDatePickerChange = useCallback((event: DateTimePickerEvent, selectedDate?: Date) => {
    if (event.type === 'dismissed') {
      setShowDatePicker(false);
      return;
    }

    if (selectedDate) {
      setCreateStartAtLocal((current) => {
        const next = new Date(current);
        next.setFullYear(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
        return next;
      });
    }

    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }
  }, []);

  const handleTimePickerChange = useCallback((event: DateTimePickerEvent, selectedDate?: Date) => {
    if (event.type === 'dismissed') {
      setShowTimePicker(false);
      return;
    }

    if (selectedDate) {
      setCreateStartAtLocal((current) => {
        const next = new Date(current);
        next.setHours(selectedDate.getHours(), selectedDate.getMinutes(), 0, 0);
        return next;
      });
    }

    if (Platform.OS === 'android') {
      setShowTimePicker(false);
    }
  }, []);

  const resetComposer = useCallback(() => {
    setShowDatePicker(false);
    setShowTimePicker(false);
    setCreateStartAtLocal(new Date(Date.now() + defaultStartOffsetMs));
  }, [defaultStartOffsetMs]);

  return {
    createStartAtLocal,
    dateValue: formatDateInputValue(createStartAtLocal),
    handleDatePickerChange,
    handleTimePickerChange,
    resetComposer,
    setCreateStartAtLocal,
    setShowDatePicker,
    setShowTimePicker,
    showDatePicker,
    showTimePicker,
    timeValue: formatTimeInputValue(createStartAtLocal),
  };
}
