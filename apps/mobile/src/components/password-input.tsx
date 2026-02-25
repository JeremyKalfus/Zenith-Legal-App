import { useState } from 'react';
import {
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { getPasswordStrength } from '../lib/password-strength';
import { uiColors } from '../theme/colors';

type PasswordInputProps = Omit<TextInputProps, 'secureTextEntry'> & {
  containerStyle?: StyleProp<ViewStyle>;
  showToggle?: boolean;
  toggleLabelShow?: string;
  toggleLabelHide?: string;
  toggleTextStyle?: StyleProp<TextStyle>;
  showStrength?: boolean;
};

export function PasswordInput({
  containerStyle,
  showToggle = true,
  toggleLabelShow = 'Show',
  toggleLabelHide = 'Hide',
  toggleTextStyle,
  showStrength = false,
  style,
  ...inputProps
}: PasswordInputProps) {
  const [isVisible, setIsVisible] = useState(false);
  const toggleLabel = isVisible ? toggleLabelHide : toggleLabelShow;
  const inputValue = typeof inputProps.value === 'string' ? inputProps.value : '';
  const strength = showStrength ? getPasswordStrength(inputValue) : null;

  return (
    <View style={[styles.container, containerStyle]}>
      <TextInput
        {...inputProps}
        secureTextEntry={!isVisible}
        autoCorrect={false}
        autoCapitalize="none"
        style={[style, showToggle ? styles.inputWithTogglePadding : null]}
      />
      {showToggle ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${toggleLabel} password`}
          accessibilityState={{ selected: isVisible }}
          onPress={() => setIsVisible((current) => !current)}
          style={styles.toggleButton}
          hitSlop={8}
        >
          <Text style={[styles.toggleText, toggleTextStyle]}>{toggleLabel}</Text>
        </Pressable>
      ) : null}
      {strength ? (
        <View style={styles.strengthWrap}>
          <View style={styles.strengthBarTrack}>
            <View
              style={[
                styles.strengthBarFill,
                {
                  width: `${Math.max(20, strength.score * 25)}%`,
                  backgroundColor: strength.color,
                },
              ]}
            />
          </View>
          <Text style={[styles.strengthLabel, { color: strength.color }]}>
            Password strength: {strength.label}
          </Text>
          <Text style={styles.strengthHelper}>{strength.helperText}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    justifyContent: 'center',
  },
  inputWithTogglePadding: {
    paddingRight: 64,
  },
  toggleButton: {
    position: 'absolute',
    right: 10,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  toggleText: {
    color: uiColors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  strengthWrap: {
    marginTop: -4,
    marginBottom: 6,
  },
  strengthBarTrack: {
    backgroundColor: '#E2E8F0',
    borderRadius: 999,
    height: 6,
    overflow: 'hidden',
    width: '100%',
  },
  strengthBarFill: {
    borderRadius: 999,
    height: '100%',
  },
  strengthLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 6,
  },
  strengthHelper: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 2,
  },
});
