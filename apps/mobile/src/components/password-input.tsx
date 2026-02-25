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
  showStrength: _showStrength = false,
  style,
  ...inputProps
}: PasswordInputProps) {
  const [isVisible, setIsVisible] = useState(false);
  const toggleLabel = isVisible ? toggleLabelHide : toggleLabelShow;

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
});
