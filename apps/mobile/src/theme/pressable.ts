import type { PressableStateCallbackType, StyleProp, ViewStyle } from 'react-native';

type InteractivePressableStyleOptions = {
  base: StyleProp<ViewStyle>;
  disabled?: boolean;
  disabledStyle?: StyleProp<ViewStyle>;
  hoverStyle?: StyleProp<ViewStyle>;
  focusStyle?: StyleProp<ViewStyle>;
  pressedStyle?: StyleProp<ViewStyle>;
};

export function interactivePressableStyle({
  base,
  disabled = false,
  disabledStyle,
  focusStyle,
  hoverStyle,
  pressedStyle,
}: InteractivePressableStyleOptions) {
  return (state: PressableStateCallbackType): StyleProp<ViewStyle> => {
    const { pressed } = state;
    const hovered = (state as PressableStateCallbackType & { hovered?: boolean }).hovered ?? false;
    const focused = (state as PressableStateCallbackType & { focused?: boolean }).focused ?? false;

    return [
      base,
      disabled && disabledStyle,
      !disabled && hovered && hoverStyle,
      !disabled && focused && focusStyle,
      !disabled && pressed && pressedStyle,
    ];
  };
}

export const sharedPressableFeedback = {
  focus: {
    opacity: 0.98,
    transform: [{ scale: 0.997 }],
  } satisfies ViewStyle,
  hover: {
    opacity: 0.96,
  } satisfies ViewStyle,
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  } satisfies ViewStyle,
} as const;
