import { AudioModule } from 'expo-audio';

type ExpoAvAudioMode = {
  playsInSilentModeIOS?: boolean;
  playsInSilentMode?: boolean;
};

// Compatibility shim so dependencies expecting expo-av can run on SDK 54+.
export const Audio = {
  setAudioModeAsync: async (mode: ExpoAvAudioMode = {}) => {
    await AudioModule.setAudioModeAsync({
      playsInSilentMode:
        mode.playsInSilentModeIOS ?? mode.playsInSilentMode ?? true,
    });
  },
  Sound: {
    createAsync: async () => {
      throw new Error(
        'expo-av Sound.createAsync is not available. Use expo-audio APIs instead.',
      );
    },
  },
};

export const Video = () => null;

export const RecordingObject = null;
