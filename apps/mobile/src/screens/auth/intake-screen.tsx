import { zodResolver } from '@hookform/resolvers/zod';
import {
  buildJdDegreeDateFromParts,
  CITY_OPTIONS,
  candidateIntakeSchema,
  candidateRegistrationSchema,
  getJdDegreeDateLabel,
  getJdDegreeDayOptions,
  getJdDegreeMonthOptions,
  getJdDegreeYearOptions,
  normalizePhoneNumber,
  parseJdDegreeDateParts,
  sanitizePhoneInput,
  type JdDegreeDateParts,
  PRACTICE_AREAS,
} from '@zenith/shared';
import { z } from 'zod';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import * as ImagePicker from 'expo-image-picker';
import { Picker } from '@react-native-picker/picker';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
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
const JD_DEGREE_MONTH_OPTIONS = getJdDegreeMonthOptions();
const JD_DEGREE_YEAR_OPTIONS = getJdDegreeYearOptions();
const EMPTY_JD_DEGREE_DATE_PARTS: JdDegreeDateParts = { year: '', month: '', day: '' };

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
    updateCandidateProfilePicture,
  } = useAuth();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [profilePictureUri, setProfilePictureUri] = useState<string | null>(null);
  const [profilePictureMimeType, setProfilePictureMimeType] = useState<string | null>(null);
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
      profilePictureUrl: '',
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
  const [jdDegreeDateParts, setJdDegreeDateParts] = useState<JdDegreeDateParts>(
    () => parseJdDegreeDateParts(selectedJdDegreeDate) ?? EMPTY_JD_DEGREE_DATE_PARTS,
  );
  const jdDegreeDayOptions = getJdDegreeDayOptions({
    year: jdDegreeDateParts.year,
    month: jdDegreeDateParts.month,
  });
  const applyJdDegreeDateParts = (nextParts: JdDegreeDateParts) => {
    const validDayOptions = getJdDegreeDayOptions({
      year: nextParts.year,
      month: nextParts.month,
    });
    const normalizedParts = {
      ...nextParts,
      day: validDayOptions.includes(nextParts.day) ? nextParts.day : '',
    };
    setJdDegreeDateParts(normalizedParts);
    setValue('jdDegreeDate', buildJdDegreeDateFromParts(normalizedParts) ?? '', {
      shouldValidate: true,
    });
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
    setValue('profilePictureUrl', profile.profile_picture_url ?? '', { shouldValidate: true });
    setValue('jdDegreeDate', profile.jd_degree_date ?? '', { shouldValidate: true });
    setValue('acceptedPrivacyPolicy', true, { shouldValidate: true });
    setValue('acceptedCommunicationConsent', true, { shouldValidate: true });
    setValue('password', 'profile-complete', { shouldValidate: true });
    setValue('confirmPassword', 'profile-complete', { shouldValidate: true });
    setProfilePictureUri(profile.profile_picture_url ?? null);
    setProfilePictureMimeType(null);
    setJdDegreeDateParts(
      parseJdDegreeDateParts(profile.jd_degree_date ?? '') ?? EMPTY_JD_DEGREE_DATE_PARTS,
    );
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

          <Text style={styles.label}>
            {usesFinishProfileCopy ? 'Profile photo (optional)' : 'Profile picture'}
          </Text>
          {profilePictureUri ? (
            <Image source={{ uri: profilePictureUri }} style={styles.profileImage} />
          ) : (
            <View style={styles.profileImagePlaceholder}>
              <Text style={styles.profileImagePlaceholderText}>No profile picture selected</Text>
            </View>
          )}
          <View style={styles.rowActions}>
            <Pressable
              style={styles.secondaryInlineButton}
              disabled={busy}
              onPress={() => {
                void (async () => {
                  try {
                    const result = await ImagePicker.launchImageLibraryAsync({
                      mediaTypes: ImagePicker.MediaTypeOptions.Images,
                      allowsEditing: true,
                      aspect: [1, 1],
                      quality: 0.8,
                    });
                    if (result.canceled) {
                      return;
                    }
                    const asset = result.assets[0];
                    if (!asset?.uri) {
                      return;
                    }
                    setProfilePictureUri(asset.uri);
                    setProfilePictureMimeType(asset.mimeType ?? null);
                  } catch (error) {
                    setMessage((error as Error).message);
                  }
                })();
              }}
            >
              <Text style={styles.secondaryInlineButtonText}>
                {profilePictureUri ? 'Change profile picture' : 'Add profile picture'}
              </Text>
            </Pressable>
            <Pressable
              style={styles.secondaryInlineButton}
              disabled={busy || !profilePictureUri}
              onPress={() => {
                setProfilePictureUri(null);
                setProfilePictureMimeType(null);
              }}
            >
              <Text
                style={[
                  styles.secondaryInlineButtonText,
                  !profilePictureUri ? styles.secondaryInlineButtonTextDisabled : null,
                ]}
              >
                Remove profile picture
              </Text>
            </Pressable>
          </View>

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

          <Text style={styles.label}>JD degree date (optional)</Text>
          <Pressable style={styles.input} onPress={() => setShowJdDatePicker((value) => !value)}>
            <Text style={styles.valueText}>{selectedJdDegreeDateLabel}</Text>
          </Pressable>
          {showJdDatePicker ? (
            <View style={styles.pickerShell}>
              <View style={styles.pickerRow}>
                <View style={styles.pickerColumn}>
                  <Picker
                    selectedValue={jdDegreeDateParts.month}
                    onValueChange={(value) => {
                      applyJdDegreeDateParts({
                        ...jdDegreeDateParts,
                        month: String(value),
                      });
                    }}
                  >
                    <Picker.Item label="Month" value="" />
                    {JD_DEGREE_MONTH_OPTIONS.map((option) => (
                      <Picker.Item key={option.value} label={option.label} value={option.value} />
                    ))}
                  </Picker>
                </View>
                <View style={styles.pickerColumn}>
                  <Picker
                    selectedValue={jdDegreeDateParts.day}
                    onValueChange={(value) => {
                      applyJdDegreeDateParts({
                        ...jdDegreeDateParts,
                        day: String(value),
                      });
                    }}
                  >
                    <Picker.Item label="Day" value="" />
                    {jdDegreeDayOptions.map((day) => (
                      <Picker.Item key={day} label={String(Number(day))} value={day} />
                    ))}
                  </Picker>
                </View>
                <View style={[styles.pickerColumn, styles.pickerColumnLast]}>
                  <Picker
                    selectedValue={jdDegreeDateParts.year}
                    onValueChange={(value) => {
                      applyJdDegreeDateParts({
                        ...jdDegreeDateParts,
                        year: String(value),
                      });
                    }}
                  >
                    <Picker.Item label="Year" value="" />
                    {JD_DEGREE_YEAR_OPTIONS.map((year) => (
                      <Picker.Item key={year} label={year} value={year} />
                    ))}
                  </Picker>
                </View>
              </View>
              <View style={styles.pickerActionRow}>
                <Pressable
                  style={styles.pickerAction}
                  onPress={() => applyJdDegreeDateParts({ year: '', month: '', day: '' })}
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

                  if (profilePictureUri !== (profile?.profile_picture_url ?? null)) {
                    await updateCandidateProfilePicture({
                      sourceUri: profilePictureUri,
                      mimeTypeHint: profilePictureMimeType,
                    });
                  }
                  setMessage('Profile saved.');
                } else {
                  const parsed = candidateRegistrationSchema.parse(values);
                  await registerCandidateWithPassword(parsed);
                  if (profilePictureUri) {
                    await updateCandidateProfilePicture({
                      sourceUri: profilePictureUri,
                      mimeTypeHint: profilePictureMimeType,
                    });
                  }
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
    marginTop: -4,
  },
  expandButtonText: {
    color: uiColors.primary,
    fontSize: 12,
    fontWeight: '700',
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
  profileImage: {
    alignSelf: 'flex-start',
    borderColor: uiColors.border,
    borderRadius: 52,
    borderWidth: 1,
    height: 104,
    width: 104,
  },
  profileImagePlaceholder: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: uiColors.divider,
    borderColor: uiColors.border,
    borderRadius: 52,
    borderWidth: 1,
    height: 104,
    justifyContent: 'center',
    paddingHorizontal: 12,
    width: 104,
  },
  profileImagePlaceholderText: {
    color: uiColors.textMuted,
    fontSize: 11,
    textAlign: 'center',
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
  pickerColumn: {
    flex: 1,
  },
  pickerColumnLast: {
    flex: 1.1,
  },
  pickerRow: {
    flexDirection: 'row',
  },
  pickerShell: {
    backgroundColor: uiColors.surface,
    borderColor: uiColors.borderStrong,
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  rowActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  secondaryInlineButton: {
    backgroundColor: uiColors.divider,
    borderColor: uiColors.borderStrong,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  secondaryInlineButtonText: {
    color: uiColors.textPrimary,
    fontSize: 12,
    fontWeight: '600',
  },
  secondaryInlineButtonTextDisabled: {
    color: uiColors.textMuted,
  },
  valueText: {
    color: uiColors.textPrimary,
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
