import { zodResolver } from '@hookform/resolvers/zod';
import {
  CITY_OPTIONS,
  candidateIntakeSchema,
  candidateRegistrationSchema,
  getJdDegreeDateLabel,
  normalizePhoneNumber,
  sanitizePhoneInput,
  PRACTICE_AREAS,
} from '@zenith/shared';
import { z } from 'zod';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { PasswordInput } from '../../components/password-input';
import { useAuth } from '../../context/auth-context';
import { GlobalRecruiterBanner } from '../../components/global-recruiter-banner';
import { uiColors } from '../../theme/colors';
import { interactivePressableStyle, sharedPressableFeedback } from '../../theme/pressable';

type CandidateRegistrationFormValues = z.input<typeof candidateRegistrationSchema>;
type IntakeMode = 'registration' | 'finishProfile' | 'signupCompletion';
const COLLAPSED_BUBBLE_ROWS_HEIGHT = 34;

function toJdDegreeLocalDate(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

function toJdDegreeIsoDate(value: Date): string {
  const year = String(value.getFullYear());
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function MultiSelectOption({
  label,
  selected,
  onToggle,
}: {
  label: string;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      onPress={onToggle}
      style={[styles.option, selected ? styles.optionSelected : null]}
    >
      <Text style={selected ? styles.optionTextSelected : styles.optionText}>
        {label}
      </Text>
    </Pressable>
  );
}

export function IntakeScreen({
  mode = 'registration',
  onSignIn,
  prefilledEmail,
}: {
  mode?: IntakeMode;
  onSignIn?: () => void;
  prefilledEmail?: string;
}) {
  const navigation = useNavigation();
  const isFinishProfile = mode === 'finishProfile';
  const isSignupCompletion = mode === 'signupCompletion';
  const usesFinishProfileCopy = isFinishProfile || isSignupCompletion;
  const {
    authConfigError,
    authNotice,
    clearAuthNotice,
    profile,
    registerCandidateWithPassword,
    updateCandidateProfileIntake,
  } = useAuth();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [showJdDatePicker, setShowJdDatePicker] = useState(false);
  const [showAllCities, setShowAllCities] = useState(false);
  const [showAllPracticeAreas, setShowAllPracticeAreas] = useState(false);
  const {
    control,
    handleSubmit,
    formState: { errors },
    watch,
    setValue,
  } = useForm<CandidateRegistrationFormValues>({
    resolver: zodResolver(
      isFinishProfile ? candidateIntakeSchema : candidateRegistrationSchema,
    ) as never,
    defaultValues: {
      name: '',
      email: prefilledEmail?.trim().toLowerCase() ?? '',
      mobile: '',
      preferredCities: [],
      otherCityText: '',
      practiceAreas: [],
      otherPracticeText: '',
      jdDegreeDate: '',
      acceptedPrivacyPolicy: isFinishProfile,
      acceptedCommunicationConsent: true,
      password: isFinishProfile ? 'profile-complete' : '',
      confirmPassword: isFinishProfile ? 'profile-complete' : '',
    },
  });

  const selectedCities = watch('preferredCities') ?? [];
  const selectedPracticeAreas = watch('practiceAreas') ?? [];
  const showGoToLoginCta = isSignupCompletion && message.toLowerCase().includes('already exists');
  const selectedJdDegreeDate = watch('jdDegreeDate') ?? '';
  const selectedJdDegreeDateLabel = selectedJdDegreeDate
    ? getJdDegreeDateLabel(selectedJdDegreeDate)
    : 'Select JD degree date';
  const selectedJdDegreeDateValue = toJdDegreeLocalDate(selectedJdDegreeDate) ?? new Date();
  const handleJdDateChange = (event: DateTimePickerEvent, nextDate?: Date) => {
    if (event.type !== 'set' || !nextDate) {
      if (Platform.OS !== 'ios') {
        setShowJdDatePicker(false);
      }
      return;
    }

    setValue('jdDegreeDate', toJdDegreeIsoDate(nextDate), {
      shouldValidate: true,
    });
    if (Platform.OS !== 'ios') {
      setShowJdDatePicker(false);
    }
  };
  const nextPracticeAreas = (
    currentValues: CandidateRegistrationFormValues['practiceAreas'],
    area: (typeof PRACTICE_AREAS)[number],
  ) => {
    const current = currentValues ?? [];
    if (current.includes(area)) {
      return current.filter((value) => value !== area);
    }
    if (current.length >= 3) {
      return current;
    }
    return [...current, area];
  };

  useEffect(() => {
    if (!isFinishProfile || !profile) {
      return;
    }
    setValue('name', profile.name ?? '', { shouldValidate: true });
    setValue('email', profile.email ?? '', { shouldValidate: true });
    setValue('mobile', profile.mobile ?? '', { shouldValidate: true });
    setValue('preferredCities', profile.preferredCities ?? [], { shouldValidate: true });
    setValue('otherCityText', profile.otherCityText ?? '', { shouldValidate: true });
    setValue('practiceAreas', profile.practiceAreas ?? [], { shouldValidate: true });
    setValue('otherPracticeText', profile.otherPracticeText ?? '', { shouldValidate: true });
    setValue('jdDegreeDate', profile.jd_degree_date ?? '', { shouldValidate: true });
    setValue('acceptedPrivacyPolicy', true, { shouldValidate: true });
    setValue('acceptedCommunicationConsent', true, { shouldValidate: true });
    setValue('password', 'profile-complete', { shouldValidate: true });
    setValue('confirmPassword', 'profile-complete', { shouldValidate: true });
  }, [isFinishProfile, profile, setValue]);

  useEffect(() => {
    if (!isSignupCompletion) {
      return;
    }
    const normalizedEmail = prefilledEmail?.trim().toLowerCase() ?? '';
    if (!normalizedEmail) {
      return;
    }

    setValue('email', normalizedEmail, { shouldValidate: true });
  }, [isSignupCompletion, prefilledEmail, setValue]);

  return (
    <SafeAreaView
      style={[styles.safeArea, Platform.OS === 'web' ? styles.safeAreaWeb : null]}
      edges={['top', 'bottom']}
    >
      <View style={Platform.OS === 'web' ? styles.webFrame : undefined}>
        <GlobalRecruiterBanner />
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          <View style={styles.container}>
          {isSignupCompletion ? (
            <Pressable
              style={styles.backButton}
              onPress={() => {
                if (navigation.canGoBack()) {
                  navigation.goBack();
                  return;
                }
                navigation.navigate('AuthMenu' as never);
              }}
            >
              <Text style={styles.backButtonText}>Back</Text>
            </Pressable>
          ) : null}
          <Text style={styles.h1}>
            {usesFinishProfileCopy ? 'Finish your profile' : 'Welcome to Zenith Legal'}
          </Text>
          <Text style={styles.body}>
            {usesFinishProfileCopy
              ? 'This lets Zenith match you with the right opportunities.'
              : 'Create your account and share your intake details to start.'}
          </Text>
          {authConfigError ? <Text style={styles.error}>{authConfigError}</Text> : null}
          {authNotice ? <Text style={styles.error}>{authNotice}</Text> : null}

          <Controller
            control={control}
            name="name"
            render={({ field }) => (
              <TextInput
                placeholder="Full name (optional)"
                style={styles.input}
                onChangeText={field.onChange}
                value={field.value}
              />
            )}
          />
          {errors.name ? <Text style={styles.error}>{errors.name.message}</Text> : null}

          <Controller
            control={control}
            name="email"
            render={({ field }) => (
              <TextInput
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="Email"
                style={[styles.input, usesFinishProfileCopy ? styles.inputDisabled : null]}
                onChangeText={field.onChange}
                value={field.value}
                editable={!usesFinishProfileCopy}
              />
            )}
          />
          {errors.email ? <Text style={styles.error}>{errors.email.message}</Text> : null}
          {mode === 'registration' ? (
            <Text style={styles.disclaimerInline}>
              We won{"'"}t spam you. We only use your email for account access and recruiting-related
              communication.
            </Text>
          ) : null}

          <Controller
            control={control}
            name="mobile"
            render={({ field }) => (
              <TextInput
                keyboardType="phone-pad"
                placeholder="Mobile number (optional)"
                style={styles.input}
                onChangeText={(value) => field.onChange(sanitizePhoneInput(value))}
                onBlur={() => {
                  const normalized = normalizePhoneNumber(field.value ?? '');
                  if (normalized.ok) {
                    setValue('mobile', normalized.e164, { shouldValidate: true });
                  }
                  field.onBlur();
                }}
                value={field.value}
              />
            )}
          />
          {errors.mobile ? <Text style={styles.error}>{errors.mobile.message}</Text> : null}
          {!errors.mobile ? (
            <Text style={styles.helper}>US numbers can be entered without +1.</Text>
          ) : null}

          {!isFinishProfile ? (
            <>
              <Controller
                control={control}
                name="password"
                render={({ field }) => (
                  <PasswordInput
                    placeholder="Password"
                    style={styles.input}
                    onChangeText={field.onChange}
                    value={field.value}
                    showStrength
                  />
                )}
              />
              {errors.password ? <Text style={styles.error}>{errors.password.message}</Text> : null}

              <Controller
                control={control}
                name="confirmPassword"
                render={({ field }) => (
                  <PasswordInput
                    placeholder="Confirm password"
                    style={styles.input}
                    onChangeText={field.onChange}
                    value={field.value}
                  />
                )}
              />
              {errors.confirmPassword ? (
                <Text style={styles.error}>{errors.confirmPassword.message}</Text>
              ) : null}
            </>
          ) : null}

          <Text style={styles.label}>Preferred Cities (choose 0-3)</Text>
          <View style={[styles.wrap, !showAllCities && styles.wrapCollapsed]}>
            {CITY_OPTIONS.map((city) => {
              const selected = selectedCities.includes(city);
              return (
                <MultiSelectOption
                  key={city}
                  label={city}
                  selected={selected}
                  onToggle={() => {
                    const next = selected
                      ? selectedCities.filter((value) => value !== city)
                      : [...selectedCities, city];
                    setValue('preferredCities', next, { shouldValidate: true });
                  }}
                />
              );
            })}
          </View>
          <Pressable style={styles.expandButton} onPress={() => setShowAllCities((value) => !value)}>
            <Text style={styles.expandButtonText}>{showAllCities ? 'Show less' : 'See more'}</Text>
          </Pressable>

          {selectedCities.includes('Other') ? (
            <Controller
              control={control}
              name="otherCityText"
              render={({ field }) => (
                <TextInput
                  placeholder="Specify city"
                  style={styles.input}
                  onChangeText={field.onChange}
                  value={field.value}
                />
              )}
            />
          ) : null}
          {errors.otherCityText ? (
            <Text style={styles.error}>{errors.otherCityText.message}</Text>
          ) : null}

          <Text style={styles.label}>JD degree date (optional)</Text>
          <Pressable style={styles.input} onPress={() => setShowJdDatePicker((value) => !value)}>
            <Text style={selectedJdDegreeDate ? styles.valueText : styles.valueTextPlaceholder}>
              {selectedJdDegreeDateLabel}
            </Text>
          </Pressable>
          {showJdDatePicker ? (
            <View style={styles.pickerShell}>
              <DateTimePicker
                value={selectedJdDegreeDateValue}
                mode="date"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                maximumDate={new Date()}
                onChange={handleJdDateChange}
              />
              <View style={styles.pickerActionRow}>
                <Pressable
                  style={styles.pickerAction}
                  onPress={() =>
                    setValue('jdDegreeDate', '', {
                      shouldValidate: true,
                    })
                  }
                >
                  <Text style={styles.pickerActionText}>Clear</Text>
                </Pressable>
                <Pressable style={styles.pickerAction} onPress={() => setShowJdDatePicker(false)}>
                  <Text style={styles.pickerActionText}>Done</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
          {errors.jdDegreeDate ? (
            <Text style={styles.error}>{errors.jdDegreeDate.message}</Text>
          ) : null}

          <Text style={styles.label}>Practice Area (choose 0-3)</Text>
          <Controller
            control={control}
            name="practiceAreas"
            render={({ field }) => (
              <View style={[styles.wrap, !showAllPracticeAreas && styles.wrapCollapsed]}>
                {PRACTICE_AREAS.map((area) => (
                  <MultiSelectOption
                    key={area}
                    label={area}
                    selected={(field.value ?? []).includes(area)}
                    onToggle={() => field.onChange(nextPracticeAreas(field.value, area))}
                  />
                ))}
              </View>
            )}
          />
          <Pressable
            style={styles.expandButton}
            onPress={() => setShowAllPracticeAreas((value) => !value)}
          >
            <Text style={styles.expandButtonText}>
              {showAllPracticeAreas ? 'Show less' : 'See more'}
            </Text>
          </Pressable>
          {errors.practiceAreas ? (
            <Text style={styles.error}>{errors.practiceAreas.message}</Text>
          ) : null}

          {selectedPracticeAreas.includes('Other') ? (
            <Controller
              control={control}
              name="otherPracticeText"
              render={({ field }) => (
                <TextInput
                  placeholder="Specify practice area"
                  style={styles.input}
                  onChangeText={field.onChange}
                  value={field.value}
                />
              )}
            />
          ) : null}
          {errors.otherPracticeText ? (
            <Text style={styles.error}>{errors.otherPracticeText.message}</Text>
          ) : null}

          {!isFinishProfile ? (
            <>
              {mode === 'registration' ? (
                <>
                  {/* Infra-dependent wording: keep this aligned with verified HTTPS/TLS + Supabase storage posture. */}
                  <View style={styles.disclaimerCard}>
                    <Text style={styles.disclaimerTitle}>Confidentiality & Encryption</Text>
                    <Text style={styles.disclaimerBody}>
                      We promise 100% confidentiality. We don{"'"}t spam, we don{"'"}t sell your data, our
                      app doesn{"'"}t track any data you don{"'"}t explicitly provide. We collect minimal
                      contact data so we can stay in touch and your contact info is encrypted during
                      transmission and in our database.
                    </Text>
                  </View>
                </>
              ) : null}

              <Controller
                control={control}
                name="acceptedPrivacyPolicy"
                render={({ field }) => (
                  <Pressable onPress={() => field.onChange(!field.value)}>
                    <Text style={styles.checkbox}>
                      {field.value ? '☑' : '☐'} I accept the Privacy Policy
                    </Text>
                  </Pressable>
                )}
              />
              {errors.acceptedPrivacyPolicy ? (
                <Text style={styles.error}>{errors.acceptedPrivacyPolicy.message}</Text>
              ) : null}
            </>
          ) : null}

          <Pressable
            style={interactivePressableStyle({
              base: styles.cta,
              disabled: busy,
              disabledStyle: styles.ctaDisabled,
              hoverStyle: sharedPressableFeedback.hover,
              focusStyle: sharedPressableFeedback.focus,
              pressedStyle: sharedPressableFeedback.pressed,
            })}
            disabled={busy}
            accessibilityState={{ disabled: busy }}
            onPress={handleSubmit(async (values) => {
              setBusy(true);
              setMessage('');
              clearAuthNotice();
              try {
                if (isFinishProfile) {
                  const parsed = candidateIntakeSchema.parse(values);
                  await updateCandidateProfileIntake(parsed);
                  setMessage('Profile saved.');
                } else {
                  const parsed = candidateRegistrationSchema.parse(values);
                  await registerCandidateWithPassword(parsed);
                  setMessage('Account created. Signing you in...');
                }
              } catch (error) {
                setMessage((error as Error).message);
              } finally {
                setBusy(false);
              }
            })}
          >
            <Text style={styles.ctaText}>
              {busy
                ? isFinishProfile
                  ? 'Saving profile...'
                  : 'Creating account...'
                : isFinishProfile
                  ? 'Save profile'
                  : 'Create account'}
            </Text>
          </Pressable>
          {message ? <Text style={styles.helper}>{message}</Text> : null}
          {showGoToLoginCta ? (
            <Pressable
              style={styles.linkButton}
              onPress={() => {
                navigation.navigate('AuthMenu' as never);
              }}
            >
              <Text style={styles.linkText}>Go to log in</Text>
            </Pressable>
          ) : null}
          {mode === 'registration' && onSignIn ? (
            <Pressable style={styles.linkButton} onPress={onSignIn}>
              <Text style={styles.linkText}>Already have an account? Sign in</Text>
            </Pressable>
          ) : null}
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  body: {
    color: uiColors.textSecondary,
    marginBottom: 12,
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 2,
  },
  backButtonText: {
    color: uiColors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  checkbox: {
    color: uiColors.textPrimary,
    fontSize: 14,
  },
  container: {
    gap: 10,
    padding: 16,
  },
  safeArea: {
    backgroundColor: uiColors.background,
    flex: 1,
  },
  safeAreaWeb: {
    alignItems: 'center',
  },
  scrollContent: {
    paddingBottom: 24,
  },
  cta: {
    alignItems: 'center',
    backgroundColor: uiColors.primary,
    borderRadius: 10,
    marginTop: 6,
    padding: 12,
  },
  ctaText: {
    color: uiColors.primaryText,
    fontWeight: '600',
  },
  ctaDisabled: {
    opacity: 0.65,
  },
  disclaimerBody: {
    color: uiColors.textStrong,
    fontSize: 12,
    lineHeight: 18,
  },
  disclaimerCard: {
    backgroundColor: '#F0FDFA',
    borderColor: '#99F6E4',
    borderRadius: 10,
    borderWidth: 1,
    gap: 4,
    padding: 10,
  },
  disclaimerInline: {
    color: uiColors.textSecondary,
    fontSize: 12,
    marginTop: -6,
  },
  disclaimerTitle: {
    color: uiColors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  error: {
    color: uiColors.error,
    fontSize: 12,
    marginTop: -2,
  },
  expandButton: {
    alignSelf: 'flex-start',
    marginTop: -8,
  },
  expandButtonText: {
    color: uiColors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  h1: {
    color: uiColors.textPrimary,
    fontSize: 24,
    fontWeight: '700',
  },
  helper: {
    color: uiColors.textSecondary,
    fontSize: 12,
    marginTop: -6,
  },
  input: {
    backgroundColor: uiColors.surface,
    borderColor: uiColors.borderStrong,
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
  },
  inputDisabled: {
    backgroundColor: uiColors.backgroundAlt,
    color: uiColors.textMuted,
  },
  linkButton: {
    marginTop: 2,
  },
  linkText: {
    color: uiColors.primary,
    fontWeight: '600',
    textAlign: 'center',
  },
  label: {
    color: uiColors.textPrimary,
    fontWeight: '600',
  },
  option: {
    backgroundColor: uiColors.divider,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  optionSelected: {
    backgroundColor: uiColors.primary,
  },
  optionText: {
    color: uiColors.textPrimary,
    fontSize: 12,
  },
  optionTextSelected: {
    color: uiColors.background,
    fontSize: 12,
  },
  pickerAction: {
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  pickerActionRow: {
    borderTopColor: uiColors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  pickerActionText: {
    color: uiColors.primary,
    fontWeight: '600',
  },
  pickerShell: {
    backgroundColor: uiColors.surface,
    borderColor: uiColors.borderStrong,
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  valueText: {
    color: uiColors.textPrimary,
  },
  valueTextPlaceholder: {
    color: uiColors.textSecondary,
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  wrapCollapsed: {
    maxHeight: COLLAPSED_BUBBLE_ROWS_HEIGHT,
    overflow: 'hidden',
  },
  webFrame: {
    alignSelf: 'center',
    backgroundColor: uiColors.background,
    borderColor: uiColors.border,
    borderRadius: 16,
    borderWidth: 1,
    boxShadow: '0px 8px 24px rgba(15, 23, 42, 0.06)',
    flexGrow: 1,
    flexShrink: 1,
    maxWidth: 1100,
    overflow: 'hidden',
    width: '100%',
    minWidth: 320,
  },
});
