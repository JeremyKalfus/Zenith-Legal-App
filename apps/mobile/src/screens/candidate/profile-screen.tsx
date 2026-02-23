import { zodResolver } from '@hookform/resolvers/zod';
import {
  CITY_OPTIONS,
  candidateIntakeSchema,
  normalizePhoneNumber,
  PRACTICE_AREAS,
  sanitizePhoneInput,
} from '@zenith/shared';
import { z } from 'zod';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { PasswordInput } from '../../components/password-input';
import { ScreenShell } from '../../components/screen-shell';
import { useAuth } from '../../context/auth-context';

type CandidateProfileFormValues = z.input<typeof candidateIntakeSchema>;
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
    <Pressable onPress={onToggle} style={[styles.option, selected ? styles.optionSelected : null]}>
      <Text style={selected ? styles.optionTextSelected : styles.optionText}>{label}</Text>
    </Pressable>
  );
}

export function ProfileScreen() {
  const {
    authNotice,
    clearAuthNotice,
    isHydratingProfile,
    isSigningOut,
    profile,
    profileLoadError,
    refreshProfile,
    signOut,
    updateEmail,
    updateCandidateProfileIntake,
    updatePassword,
  } = useAuth();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [emailDraft, setEmailDraft] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMessage, setEmailMessage] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState('');
  const [showAllCities, setShowAllCities] = useState(false);
  const [showAllPracticeAreas, setShowAllPracticeAreas] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors },
    watch,
    setValue,
    reset,
  } = useForm<CandidateProfileFormValues>({
    resolver: zodResolver(candidateIntakeSchema),
    defaultValues: {
      name: '',
      email: '',
      mobile: '',
      preferredCities: [],
      otherCityText: '',
      practiceArea: undefined,
      otherPracticeText: '',
      acceptedPrivacyPolicy: false,
      acceptedCommunicationConsent: true,
    },
  });

  useEffect(() => {
    if (!profile) {
      return;
    }

    reset({
      name: profile.name ?? '',
      email: profile.email,
      mobile: profile.mobile ?? '',
      preferredCities: profile.preferredCities ?? [],
      otherCityText: profile.otherCityText ?? '',
      practiceArea: profile.practiceArea ?? undefined,
      otherPracticeText: profile.otherPracticeText ?? '',
      acceptedPrivacyPolicy: profile.acceptedPrivacyPolicy,
      acceptedCommunicationConsent: true,
    });
    setMessage('');
    setEmailDraft(profile.email);
    setEmailMessage('');
    setNewPassword('');
    setConfirmNewPassword('');
    setPasswordMessage('');
  }, [profile, reset]);

  const selectedCities = watch('preferredCities') ?? [];
  const selectedPractice = watch('practiceArea');

  return (
    <ScreenShell>
      <Text style={styles.title}>Profile</Text>

      {profile ? (
        <>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Email</Text>
            <Text style={styles.helper}>
              Update your account email. You may need to confirm the new address from your inbox.
            </Text>
            <TextInput
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="Email"
              style={styles.input}
              value={emailDraft}
              onChangeText={setEmailDraft}
            />
            <Pressable
              style={[styles.secondaryButton, emailBusy && styles.buttonDisabled]}
              disabled={emailBusy}
              accessibilityState={{ disabled: emailBusy }}
              onPress={async () => {
                setEmailBusy(true);
                setEmailMessage('');
                clearAuthNotice();
                try {
                  await updateEmail(emailDraft);
                  setEmailMessage('Email update requested. Check your inbox to confirm the new address.');
                } catch (error) {
                  setEmailMessage((error as Error).message);
                } finally {
                  setEmailBusy(false);
                }
              }}
            >
              <Text style={styles.secondaryButtonText}>{emailBusy ? 'Updating email...' : 'Update email'}</Text>
            </Pressable>
            {emailMessage ? <Text style={styles.message}>{emailMessage}</Text> : null}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Profile Details</Text>

            <Controller
              control={control}
              name="name"
              render={({ field }) => (
                <TextInput
                  placeholder="Full name (optional)"
                  style={styles.input}
                  onChangeText={field.onChange}
                  value={field.value ?? ''}
                />
              )}
            />
            {errors.name ? <Text style={styles.error}>{errors.name.message}</Text> : null}

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
                    const rawValue = field.value ?? '';
                    if (!rawValue) {
                      field.onBlur();
                      return;
                    }
                    const normalized = normalizePhoneNumber(rawValue);
                    if (normalized.ok) {
                      setValue('mobile', normalized.e164, { shouldValidate: true });
                    }
                    field.onBlur();
                  }}
                  value={field.value ?? ''}
                />
              )}
            />
            {errors.mobile ? <Text style={styles.error}>{errors.mobile.message}</Text> : null}
            {!errors.mobile ? (
              <Text style={styles.helper}>US numbers can be entered without +1.</Text>
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
                    value={field.value ?? ''}
                  />
                )}
              />
            ) : null}
            {errors.otherCityText ? <Text style={styles.error}>{errors.otherCityText.message}</Text> : null}

            <Text style={styles.label}>Practice Area (choose 0-3)</Text>
            <Controller
              control={control}
              name="practiceArea"
              render={({ field }) => (
                <View style={[styles.wrap, !showAllPracticeAreas && styles.wrapCollapsed]}>
                  {PRACTICE_AREAS.map((area) => (
                    <MultiSelectOption
                      key={area}
                      label={area}
                      selected={field.value === area}
                      onToggle={() => field.onChange(field.value === area ? undefined : area)}
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
            {errors.practiceArea ? <Text style={styles.error}>{errors.practiceArea.message}</Text> : null}

            {selectedPractice === 'Other' ? (
              <Controller
                control={control}
                name="otherPracticeText"
                render={({ field }) => (
                  <TextInput
                    placeholder="Specify practice area"
                    style={styles.input}
                    onChangeText={field.onChange}
                    value={field.value ?? ''}
                  />
                )}
              />
            ) : null}
            {errors.otherPracticeText ? (
              <Text style={styles.error}>{errors.otherPracticeText.message}</Text>
            ) : null}

            <Controller
              control={control}
              name="acceptedPrivacyPolicy"
              render={({ field }) => (
                <Pressable onPress={() => field.onChange(!field.value)}>
                  <Text style={styles.checkbox}>
                    {field.value ? '☑' : '☐'} I accept the Privacy Policy (required)
                  </Text>
                </Pressable>
              )}
            />
            {errors.acceptedPrivacyPolicy ? (
              <Text style={styles.error}>{errors.acceptedPrivacyPolicy.message}</Text>
            ) : null}

            <Pressable
              style={[styles.primaryButton, busy && styles.buttonDisabled]}
              disabled={busy}
              accessibilityState={{ disabled: busy }}
              onPress={handleSubmit(async (values) => {
                setBusy(true);
                setMessage('');
                clearAuthNotice();
                try {
                  const parsed = candidateIntakeSchema.parse(values);
                  await updateCandidateProfileIntake(parsed);
                  setMessage('Profile updated.');
                } catch (error) {
                  setMessage((error as Error).message);
                } finally {
                  setBusy(false);
                }
              })}
            >
              <Text style={styles.primaryButtonText}>{busy ? 'Saving...' : 'Save profile'}</Text>
            </Pressable>
            {message ? <Text style={styles.message}>{message}</Text> : null}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Password</Text>
            <Text style={styles.helper}>Update your password for email sign-in.</Text>
            <PasswordInput
              placeholder="New password"
              style={styles.input}
              value={newPassword}
              onChangeText={setNewPassword}
              showStrength
            />
            <PasswordInput
              placeholder="Confirm new password"
              style={styles.input}
              value={confirmNewPassword}
              onChangeText={setConfirmNewPassword}
            />
            <Pressable
              style={[styles.secondaryButton, passwordBusy && styles.buttonDisabled]}
              disabled={passwordBusy}
              accessibilityState={{ disabled: passwordBusy }}
              onPress={async () => {
                setPasswordBusy(true);
                setPasswordMessage('');
                clearAuthNotice();
                try {
                  if (newPassword.length < 6) {
                    throw new Error('Password must be at least 6 characters');
                  }
                  if (newPassword !== confirmNewPassword) {
                    throw new Error('Passwords do not match');
                  }
                  await updatePassword(newPassword);
                  setNewPassword('');
                  setConfirmNewPassword('');
                  setPasswordMessage('Password updated successfully.');
                } catch (error) {
                  setPasswordMessage((error as Error).message);
                } finally {
                  setPasswordBusy(false);
                }
              }}
            >
              <Text style={styles.secondaryButtonText}>
                {passwordBusy ? 'Updating password...' : 'Update password'}
              </Text>
            </Pressable>
            {passwordMessage ? <Text style={styles.message}>{passwordMessage}</Text> : null}
          </View>
        </>
      ) : isHydratingProfile ? (
        <View style={styles.placeholderCard}>
          <Text style={styles.placeholderText}>Loading your profile...</Text>
        </View>
      ) : (
        <View style={styles.placeholderCard}>
          <Text style={styles.placeholderText}>
            {profileLoadError ?? 'Profile information is not available yet.'}
          </Text>
          <Pressable
            style={styles.retryButton}
            disabled={isSigningOut}
            onPress={() => {
              void refreshProfile();
            }}
          >
            <Text style={styles.retryButtonText}>Retry profile</Text>
          </Pressable>
        </View>
      )}

      {authNotice ? <Text style={styles.error}>{authNotice}</Text> : null}

      <Pressable
        style={[styles.logout, isSigningOut && styles.buttonDisabled]}
        disabled={isSigningOut}
        accessibilityState={{ disabled: isSigningOut }}
        onPress={() => {
          void signOut();
        }}
      >
        <Text style={styles.logoutText}>{isSigningOut ? 'Signing out...' : 'Sign out'}</Text>
      </Pressable>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  buttonDisabled: {
    opacity: 0.6,
  },
  card: {
    backgroundColor: '#ffffff',
    borderColor: '#E2E8F0',
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
    padding: 12,
  },
  checkbox: {
    color: '#0F172A',
    fontSize: 14,
  },
  error: {
    color: '#B91C1C',
    fontSize: 12,
  },
  expandButton: {
    alignSelf: 'flex-start',
    marginTop: -4,
  },
  expandButtonText: {
    color: '#0F766E',
    fontSize: 12,
    fontWeight: '700',
  },
  helper: {
    color: '#64748B',
    fontSize: 12,
  },
  input: {
    backgroundColor: '#ffffff',
    borderColor: '#CBD5E1',
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
  },
  label: {
    color: '#64748B',
    fontSize: 12,
    textTransform: 'uppercase',
  },
  logout: {
    alignItems: 'center',
    backgroundColor: '#7F1D1D',
    borderRadius: 10,
    padding: 12,
  },
  logoutText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  message: {
    color: '#0F172A',
    fontSize: 13,
  },
  option: {
    backgroundColor: '#E2E8F0',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  optionSelected: {
    backgroundColor: '#0F766E',
  },
  optionText: {
    color: '#0F172A',
    fontSize: 12,
    fontWeight: '600',
  },
  optionTextSelected: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  placeholderCard: {
    backgroundColor: '#ffffff',
    borderColor: '#E2E8F0',
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
    padding: 12,
  },
  placeholderText: {
    color: '#475569',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#0F766E',
    borderRadius: 10,
    padding: 12,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  retryButton: {
    alignItems: 'center',
    backgroundColor: '#E2E8F0',
    borderRadius: 8,
    padding: 10,
  },
  retryButtonText: {
    color: '#0F172A',
    fontWeight: '600',
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#E2E8F0',
    borderRadius: 10,
    padding: 12,
  },
  secondaryButtonText: {
    color: '#0F172A',
    fontWeight: '700',
  },
  sectionTitle: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '700',
  },
  title: {
    color: '#0F172A',
    fontSize: 24,
    fontWeight: '700',
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
});
