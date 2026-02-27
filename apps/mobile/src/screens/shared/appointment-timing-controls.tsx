import { Platform, Pressable, Text, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker';
import { formatAppointmentDateTime } from '../../lib/date-format';
import { DURATION_OPTIONS } from '../../lib/appointments-shared';

type AppointmentTimingControlStyles = {
  helperText: object;
  input: object;
  pickerDone: object;
  pickerDoneText: object;
  pickerShell: object;
  valueText: object;
};

export function AppointmentTimingControls({
  createDurationMinutes,
  createEndAtLocal,
  createStartAtLocal,
  handleStartPickerChange,
  selectedDurationLabel,
  setCreateDurationMinutes,
  setShowDurationPicker,
  setShowStartPicker,
  showDurationPicker,
  showStartPicker,
  styles,
}: {
  createDurationMinutes: number;
  createEndAtLocal: Date;
  createStartAtLocal: Date;
  handleStartPickerChange: (event: DateTimePickerEvent, selectedDate?: Date) => void;
  selectedDurationLabel: string;
  setCreateDurationMinutes: (minutes: number) => void;
  setShowDurationPicker: (value: boolean | ((value: boolean) => boolean)) => void;
  setShowStartPicker: (value: boolean | ((value: boolean) => boolean)) => void;
  showDurationPicker: boolean;
  showStartPicker: boolean;
  styles: AppointmentTimingControlStyles;
}) {
  return (
    <>
      <Pressable style={styles.input} onPress={() => setShowStartPicker((value) => !value)}>
        <Text style={styles.valueText}>Start: {formatAppointmentDateTime(createStartAtLocal.toISOString())}</Text>
      </Pressable>
      {showStartPicker ? (
        <View style={styles.pickerShell}>
          <DateTimePicker
            value={createStartAtLocal}
            mode="datetime"
            display="spinner"
            minimumDate={new Date()}
            onChange={handleStartPickerChange}
          />
          {Platform.OS === 'ios' ? (
            <Pressable style={styles.pickerDone} onPress={() => setShowStartPicker(false)}>
              <Text style={styles.pickerDoneText}>Done</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <Pressable style={styles.input} onPress={() => setShowDurationPicker((value) => !value)}>
        <Text style={styles.valueText}>Meeting length: {selectedDurationLabel}</Text>
      </Pressable>
      {showDurationPicker ? (
        <View style={styles.pickerShell}>
          <Picker selectedValue={createDurationMinutes} onValueChange={(value) => setCreateDurationMinutes(Number(value))}>
            {DURATION_OPTIONS.map((option) => (
              <Picker.Item key={option.minutes} label={option.label} value={option.minutes} />
            ))}
          </Picker>
          {Platform.OS === 'ios' ? (
            <Pressable style={styles.pickerDone} onPress={() => setShowDurationPicker(false)}>
              <Text style={styles.pickerDoneText}>Done</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <Text style={styles.helperText}>Ends: {formatAppointmentDateTime(createEndAtLocal.toISOString())}</Text>
    </>
  );
}
