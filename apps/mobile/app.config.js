const PLACEHOLDER_SUPABASE_URL = 'https://placeholder.supabase.co';
const PLACEHOLDER_SUPABASE_ANON_KEY = 'public-anon-key';
const PLACEHOLDER_STREAM_API_KEY = 'placeholder-stream-api-key';

function isMissingOrPlaceholder(value, placeholders) {
  return !value || placeholders.includes(value);
}

function validateProductionEnv() {
  const missing = [];

  if (
    isMissingOrPlaceholder(process.env.EXPO_PUBLIC_SUPABASE_URL, [PLACEHOLDER_SUPABASE_URL])
  ) {
    missing.push('EXPO_PUBLIC_SUPABASE_URL');
  }

  if (
    isMissingOrPlaceholder(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY, [PLACEHOLDER_SUPABASE_ANON_KEY])
  ) {
    missing.push('EXPO_PUBLIC_SUPABASE_ANON_KEY');
  }

  if (
    isMissingOrPlaceholder(process.env.EXPO_PUBLIC_STREAM_API_KEY, [
      PLACEHOLDER_STREAM_API_KEY,
      'placeholder',
    ])
  ) {
    missing.push('EXPO_PUBLIC_STREAM_API_KEY');
  }

  if (missing.length > 0) {
    throw new Error(
      `Production mobile build is missing required runtime env vars: ${missing.join(', ')}`,
    );
  }
}

module.exports = () => {
  const isProductionBuild = process.env.EAS_BUILD_PROFILE === 'production';

  if (isProductionBuild) {
    validateProductionEnv();
  }

  const iosInfoPlist = {
    ITSAppUsesNonExemptEncryption: false,
  };

  if (!isProductionBuild) {
    iosInfoPlist.NSAppTransportSecurity = {
      NSExceptionDomains: {
        localhost: {
          NSExceptionAllowsInsecureHTTPLoads: true,
        },
      },
    };
  }

  return {
    expo: {
      name: 'Zenith Legal',
      slug: 'zenith-legal-mobile',
      scheme: 'zenithlegal',
      version: '1.0.0',
      orientation: 'portrait',
      icon: './assets/ICON.png',
      userInterfaceStyle: 'light',
      newArchEnabled: true,
      splash: {
        image: './assets/splash-icon.png',
        resizeMode: 'contain',
        backgroundColor: '#ffffff',
      },
      ios: {
        supportsTablet: true,
        bundleIdentifier: 'com.zenithlegal.app',
        buildNumber: '1',
        infoPlist: iosInfoPlist,
      },
      android: {
        package: 'com.zenithlegal.app',
        versionCode: 1,
        adaptiveIcon: {
          foregroundImage: './assets/ICON.png',
          backgroundColor: '#ffffff',
        },
        edgeToEdgeEnabled: true,
        predictiveBackGestureEnabled: false,
      },
      web: {
        favicon: './assets/favicon.png',
      },
      plugins: [
        ['expo-secure-store', { faceIDPermission: false }],
        'expo-notifications',
        [
          'expo-calendar',
          {
            calendarPermission:
              'Allow Zenith Legal to access your calendar so scheduled appointments can sync automatically.',
            remindersPermission: false,
          },
        ],
      ],
      extra: {
        eas: {
          projectId: '38f93994-daaa-4c85-a092-a70ac12f0c06',
        },
      },
      owner: 'jeremykalfus',
    },
  };
};
