import { zodResolver } from '@hookform/resolvers/zod';
import {
  CITY_OPTIONS,
  candidateRegistrationSchema,
  normalizePhoneNumber,
  sanitizePhoneInput,
  PRACTICE_AREAS,
} from '@zenith/shared';
import { z } from 'zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PasswordInput } from '../../components/password-input';
import { useAuth } from '../../context/auth-context';
import { GlobalRecruiterBanner } from '../../components/global-recruiter-banner';
import { uiColors } from '../../theme/colors';
import { interactivePressableStyle, sharedPressableFeedback } from '../../theme/pressable';

type CandidateRegistrationFormValues = z.input<typeof candidateRegistrationSchema>;
const COLLAPSED_BUBBLE_ROWS_HEIGHT = 34;

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
  onSignIn,
}: {
  onSignIn: () => void;
}) {
  const { authConfigError, authNotice, clearAuthNotice, registerCandidateWithPassword } = useAuth();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [showAllCities, setShowAllCities] = useState(false);
  const [showAllPracticeAreas, setShowAllPracticeAreas] = useState(false);
  const {
    control,
    handleSubmit,
    formState: { errors },
    watch,
    setValue,
  } = useForm<CandidateRegistrationFormValues>({
    resolver: zodResolver(candidateRegistrationSchema),
    defaultValues: {
      name: '',
      email: '',
      mobile: '',
      preferredCities: [],
      otherCityText: '',
      practiceAreas: [],
      otherPracticeText: '',
      acceptedPrivacyPolicy: false,
      acceptedCommunicationConsent: true,
      password: '',
      confirmPassword: '',
    },
  });

  const selectedCities = watch('preferredCities') ?? [];
  const selectedPracticeAreas = watch('practiceAreas') ?? [];

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
          <Text style={styles.h1}>Welcome to Zenith Legal</Text>
          <Text style={styles.body}>
            Create your account and share your intake details to start.
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
                style={styles.input}
                onChangeText={field.onChange}
                value={field.value}
              />
            )}
          />
          {errors.email ? <Text style={styles.error}>{errors.email.message}</Text> : null}
          <Text style={styles.disclaimerInline}>
            We won{"'"}t spam you. We only use your email for account access and recruiting-related
            communication.
          </Text>

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
                    onToggle={() => {
                      const current = field.value ?? [];
                      const alreadySelected = current.includes(area);
                      if (alreadySelected) {
                        field.onChange(current.filter((value) => value !== area));
                        return;
                      }
                      if (current.length >= 3) {
                        return;
                      }
                      field.onChange([...current, area]);
                    }}
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
                const parsed = candidateRegistrationSchema.parse(values);
                await registerCandidateWithPassword(parsed);
                setMessage('Account created. Signing you in...');
              } catch (error) {
                setMessage((error as Error).message);
              } finally {
                setBusy(false);
              }
            })}
          >
            <Text style={styles.ctaText}>{busy ? 'Creating account...' : 'Create account'}</Text>
          </Pressable>
          {message ? <Text style={styles.helper}>{message}</Text> : null}
          <Pressable style={styles.linkButton} onPress={onSignIn}>
            <Text style={styles.linkText}>Already have an account? Sign in</Text>
          </Pressable>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  body: {
    color: '#475569',
    marginBottom: 12,
  },
  checkbox: {
    color: '#0F172A',
    fontSize: 14,
  },
  container: {
    gap: 10,
    padding: 16,
  },
  safeArea: {
    backgroundColor: '#F8FAFC',
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
    color: '#334155',
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
    color: '#475569',
    fontSize: 12,
    marginTop: -6,
  },
  disclaimerTitle: {
    color: '#0F172A',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  error: {
    color: '#B91C1C',
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
    color: '#0F172A',
    fontSize: 24,
    fontWeight: '700',
  },
  helper: {
    color: '#475569',
    fontSize: 12,
    marginTop: -6,
  },
  input: {
    backgroundColor: '#ffffff',
    borderColor: '#CBD5E1',
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
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
    color: '#0F172A',
    fontWeight: '600',
  },
  option: {
    backgroundColor: '#E2E8F0',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  optionSelected: {
    backgroundColor: uiColors.primary,
  },
  optionText: {
    color: '#0F172A',
    fontSize: 12,
  },
  optionTextSelected: {
    color: '#F8FAFC',
    fontSize: 12,
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
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
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
