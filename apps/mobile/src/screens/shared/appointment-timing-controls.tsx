import { Platform, Pressable, Text, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';

type AppointmentTimingControlStyles = {
  input: object;
  pickerDone: object;
  pickerDoneText: object;
  pickerShell: object;
  valueText: object;
};

function formatDateLabel(value: Date): string {
  return value.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatTimeLabel(value: Date): string {
  return value.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function AppointmentTimingControls({
  createStartAtLocal,
  handleDatePickerChange,
  handleTimePickerChange,
  setShowDatePicker,
  setShowTimePicker,
  showDatePicker,
  showTimePicker,
  styles,
}: {
  createStartAtLocal: Date;
  handleDatePickerChange: (event: DateTimePickerEvent, selectedDate?: Date) => void;
  handleTimePickerChange: (event: DateTimePickerEvent, selectedDate?: Date) => void;
  setShowDatePicker: (value: boolean | ((value: boolean) => boolean)) => void;
  setShowTimePicker: (value: boolean | ((value: boolean) => boolean)) => void;
  showDatePicker: boolean;
  showTimePicker: boolean;
  styles: AppointmentTimingControlStyles;
}) {
  return (
    <>
      <Pressable style={styles.input} onPress={() => setShowDatePicker((value) => !value)}>
        <Text style={styles.valueText}>Date: {formatDateLabel(createStartAtLocal)}</Text>
      </Pressable>
      {showDatePicker ? (
        <View style={styles.pickerShell}>
          <DateTimePicker
            value={createStartAtLocal}
            mode="date"
            display="spinner"
            minimumDate={new Date()}
            onChange={handleDatePickerChange}
          />
          {Platform.OS === 'ios' ? (
            <Pressable style={styles.pickerDone} onPress={() => setShowDatePicker(false)}>
              <Text style={styles.pickerDoneText}>Done</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <Pressable style={styles.input} onPress={() => setShowTimePicker((value) => !value)}>
        <Text style={styles.valueText}>Time: {formatTimeLabel(createStartAtLocal)}</Text>
      </Pressable>
      {showTimePicker ? (
        <View style={styles.pickerShell}>
          <DateTimePicker
            value={createStartAtLocal}
            mode="time"
            display="spinner"
            onChange={handleTimePickerChange}
          />
          {Platform.OS === 'ios' ? (
            <Pressable style={styles.pickerDone} onPress={() => setShowTimePicker(false)}>
              <Text style={styles.pickerDoneText}>Done</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </>
  );
}
