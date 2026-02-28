import { zodResolver } from '@hookform/resolvers/zod';
import {
  CITY_OPTIONS,
  type CityOption,
  candidateIntakeSchema,
  getJdDegreeDateLabel,
  normalizePhoneNumber,
  PRACTICE_AREAS,
  sanitizePhoneInput,
} from '@zenith/shared';
import { z } from 'zod';
import { useCallback, useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { CalendarSyncCard } from '../../components/calendar-sync-card';
import { PasswordInput } from '../../components/password-input';
import { ScreenShell } from '../../components/screen-shell';
import { SignOutButton } from '../../components/sign-out-button';
import { useAuth } from '../../context/auth-context';
import { uiColors } from '../../theme/colors';
import { interactivePressableStyle, sharedPressableFeedback } from '../../theme/pressable';

type CandidateProfileFormValues = z.input<typeof candidateIntakeSchema>;
const COLLAPSED_BUBBLE_ROWS_HEIGHT = 34;
const EMPTY_SELECTED_CITIES: CityOption[] = [];
const EMPTY_SELECTED_PRACTICE_AREAS: (typeof PRACTICE_AREAS)[number][] = [];

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
    <Pressable onPress={onToggle} style={[styles.option, selected ? styles.optionSelected : null]}>
      <Text style={selected ? styles.optionTextSelected : styles.optionText}>{label}</Text>
    </Pressable>
  );
}

type ProfileScreenHook = ReturnType<typeof useProfileScreen>;

function useProfileScreen() {
  const {
    authNotice,
    clearAuthNotice,
    isHydratingProfile,
    isSigningOut,
    profile,
    profileLoadError,
    refreshProfile,
    signOut,
    deleteAccount,
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
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState('');
  const [showJdDatePicker, setShowJdDatePicker] = useState(false);

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
      practiceAreas: [],
      otherPracticeText: '',
      jdDegreeDate: '',
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
      practiceAreas: profile.practiceAreas ?? [],
      otherPracticeText: profile.otherPracticeText ?? '',
      jdDegreeDate: profile.jd_degree_date ?? '',
      acceptedPrivacyPolicy: profile.acceptedPrivacyPolicy,
      acceptedCommunicationConsent: true,
    });
    setMessage('');
    setEmailDraft(profile.email);
    setEmailMessage('');
    setNewPassword('');
    setConfirmNewPassword('');
    setPasswordMessage('');
    setDeleteConfirmText('');
    setDeleteMessage('');
    setShowJdDatePicker(false);
  }, [profile, reset]);

  const selectedCities = watch('preferredCities') ?? EMPTY_SELECTED_CITIES;
  const selectedPracticeAreas = watch('practiceAreas') ?? EMPTY_SELECTED_PRACTICE_AREAS;
  const selectedJdDegreeDate = watch('jdDegreeDate') ?? '';
  const selectedJdDegreeDateLabel = selectedJdDegreeDate
    ? getJdDegreeDateLabel(selectedJdDegreeDate)
    : 'Select JD degree date';
  const selectedJdDegreeDateValue = toJdDegreeLocalDate(selectedJdDegreeDate) ?? new Date();
  const onJdDateChange = useCallback(
    (event: DateTimePickerEvent, nextDate?: Date) => {
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
    },
    [setValue],
  );

  const confirmDeletePrompt = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      return window.confirm(
        'Delete your Zenith Legal account permanently? This cannot be undone.',
      );
    }

    return new Promise((resolve) => {
      Alert.alert(
        'Delete account?',
        'This permanently deletes your Zenith Legal account and signs you out.',
        [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
          {
            text: 'Delete account',
            style: 'destructive',
            onPress: () => resolve(true),
          },
        ],
        { cancelable: true, onDismiss: () => resolve(false) },
      );
    });
  }, []);

  const onSubmitEmail = useCallback(async () => {
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
  }, [clearAuthNotice, emailDraft, updateEmail]);

  const onSubmitProfile = handleSubmit(async (values) => {
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
  });

  const onSubmitPassword = useCallback(async () => {
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
  }, [clearAuthNotice, confirmNewPassword, newPassword, updatePassword]);

  const onDeleteAccount = useCallback(async () => {
    setDeleteMessage('');
    clearAuthNotice();
    const confirmed = await confirmDeletePrompt();
    if (!confirmed) {
      return;
    }

    setDeleteBusy(true);
    try {
      await deleteAccount();
    } catch (error) {
      setDeleteMessage((error as Error).message);
    } finally {
      setDeleteBusy(false);
    }
  }, [clearAuthNotice, confirmDeletePrompt, deleteAccount]);

  const onToggleCity = useCallback(
    (city: CityOption) => {
      const selected = selectedCities.includes(city);
      const next = selected
        ? selectedCities.filter((value) => value !== city)
        : [...selectedCities, city];
      setValue('preferredCities', next, { shouldValidate: true });
    },
    [selectedCities, setValue],
  );

  const toggleShowAllCities = useCallback(() => setShowAllCities((value) => !value), []);
  const toggleShowAllPracticeAreas = useCallback(
    () => setShowAllPracticeAreas((value) => !value),
    [],
  );

  const onMobileBlur = useCallback(
    (rawValue: string) => {
      if (!rawValue) {
        return;
      }
      const normalized = normalizePhoneNumber(rawValue);
      if (normalized.ok) {
        setValue('mobile', normalized.e164, { shouldValidate: true });
      }
    },
    [setValue],
  );

  const onSignOut = useCallback(() => {
    void signOut();
  }, [signOut]);

  const onRetryProfile = useCallback(() => {
    void refreshProfile();
  }, [refreshProfile]);

  const deleteDisabled = deleteBusy || deleteConfirmText.trim().toUpperCase() !== 'DELETE';

  return {
    authNotice,
    busy,
    confirmNewPassword,
    control,
    deleteBusy,
    deleteConfirmText,
    deleteDisabled,
    deleteMessage,
    emailBusy,
    emailDraft,
    emailMessage,
    errors,
    isHydratingProfile,
    isSigningOut,
    message,
    newPassword,
    onDeleteAccount,
    onMobileBlur,
    onRetryProfile,
    onSignOut,
    onSubmitEmail,
    onSubmitPassword,
    onSubmitProfile,
    onToggleCity,
    passwordBusy,
    passwordMessage,
    profile,
    profileLoadError,
    selectedCities,
    selectedJdDegreeDate,
    selectedJdDegreeDateLabel,
    selectedJdDegreeDateValue,
    selectedPracticeAreas,
    onJdDateChange,
    setConfirmNewPassword,
    setDeleteConfirmText,
    setEmailDraft,
    setNewPassword,
    setShowJdDatePicker,
    setValue,
    showJdDatePicker,
    showAllCities,
    showAllPracticeAreas,
    toggleShowAllCities,
    toggleShowAllPracticeAreas,
  };
}

function EmailCard({ h }: { h: ProfileScreenHook }) {
  return (
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
        value={h.emailDraft}
        onChangeText={h.setEmailDraft}
      />
      <Pressable
        style={[styles.secondaryButton, h.emailBusy && styles.buttonDisabled]}
        disabled={h.emailBusy}
        accessibilityState={{ disabled: h.emailBusy }}
        onPress={h.onSubmitEmail}
      >
        <Text style={styles.secondaryButtonText}>{h.emailBusy ? 'Updating email...' : 'Update email'}</Text>
      </Pressable>
      {h.emailMessage ? <Text style={styles.message}>{h.emailMessage}</Text> : null}
    </View>
  );
}

function ProfileDetailsCard({ h }: { h: ProfileScreenHook }) {
  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>Profile Details</Text>

      <Controller
        control={h.control}
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
      {h.errors.name ? <Text style={styles.error}>{h.errors.name.message}</Text> : null}

      <Controller
        control={h.control}
        name="mobile"
        render={({ field }) => (
          <TextInput
            keyboardType="phone-pad"
            placeholder="Mobile number (optional)"
            style={styles.input}
            onChangeText={(value) => field.onChange(sanitizePhoneInput(value))}
            onBlur={() => {
              h.onMobileBlur(field.value ?? '');
              field.onBlur();
            }}
            value={field.value ?? ''}
          />
        )}
      />
      {h.errors.mobile ? <Text style={styles.error}>{h.errors.mobile.message}</Text> : null}
      {!h.errors.mobile ? (
        <Text style={styles.helper}>US numbers can be entered without +1.</Text>
      ) : null}

      <Text style={styles.label}>Preferred Cities (choose 0-3)</Text>
      <View style={[styles.wrap, !h.showAllCities && styles.wrapCollapsed]}>
        {CITY_OPTIONS.map((city) => (
          <MultiSelectOption
            key={city}
            label={city}
            selected={h.selectedCities.includes(city)}
            onToggle={() => h.onToggleCity(city)}
          />
        ))}
      </View>
      <Pressable style={styles.expandButton} onPress={h.toggleShowAllCities}>
        <Text style={styles.expandButtonText}>{h.showAllCities ? 'Show less' : 'See more'}</Text>
      </Pressable>

      {h.selectedCities.includes('Other') ? (
        <Controller
          control={h.control}
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
      {h.errors.otherCityText ? <Text style={styles.error}>{h.errors.otherCityText.message}</Text> : null}

      <Text style={styles.label}>JD degree date (optional)</Text>
      <Pressable style={styles.input} onPress={() => h.setShowJdDatePicker((value) => !value)}>
        <Text style={h.selectedJdDegreeDate ? styles.valueText : styles.valueTextPlaceholder}>
          {h.selectedJdDegreeDateLabel}
        </Text>
      </Pressable>
      {h.showJdDatePicker ? (
        <View style={styles.pickerShell}>
          <DateTimePicker
            value={h.selectedJdDegreeDateValue}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            maximumDate={new Date()}
            onChange={h.onJdDateChange}
          />
          <View style={styles.pickerActionRow}>
            <Pressable
              style={styles.pickerAction}
              onPress={() =>
                h.setValue('jdDegreeDate', '', {
                  shouldValidate: true,
                })
              }
            >
              <Text style={styles.pickerActionText}>Clear</Text>
            </Pressable>
            <Pressable style={styles.pickerAction} onPress={() => h.setShowJdDatePicker(false)}>
              <Text style={styles.pickerActionText}>Done</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      {h.errors.jdDegreeDate ? <Text style={styles.error}>{h.errors.jdDegreeDate.message}</Text> : null}

      <Text style={styles.label}>Practice Area (choose 0-3)</Text>
      <Controller
        control={h.control}
        name="practiceAreas"
        render={({ field }) => (
          <View style={[styles.wrap, !h.showAllPracticeAreas && styles.wrapCollapsed]}>
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
      <Pressable style={styles.expandButton} onPress={h.toggleShowAllPracticeAreas}>
        <Text style={styles.expandButtonText}>
          {h.showAllPracticeAreas ? 'Show less' : 'See more'}
        </Text>
      </Pressable>
      {h.errors.practiceAreas ? <Text style={styles.error}>{h.errors.practiceAreas.message}</Text> : null}

      {h.selectedPracticeAreas.includes('Other') ? (
        <Controller
          control={h.control}
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
      {h.errors.otherPracticeText ? (
        <Text style={styles.error}>{h.errors.otherPracticeText.message}</Text>
      ) : null}

      <Controller
        control={h.control}
        name="acceptedPrivacyPolicy"
        render={({ field }) => (
          <Pressable onPress={() => field.onChange(!field.value)}>
            <Text style={styles.checkbox}>
              {field.value ? '☑' : '☐'} I accept the Privacy Policy (required)
            </Text>
          </Pressable>
        )}
      />
      {h.errors.acceptedPrivacyPolicy ? (
        <Text style={styles.error}>{h.errors.acceptedPrivacyPolicy.message}</Text>
      ) : null}

      <Pressable
        style={interactivePressableStyle({
          base: styles.primaryButton,
          disabled: h.busy,
          disabledStyle: styles.buttonDisabled,
          hoverStyle: sharedPressableFeedback.hover,
          focusStyle: sharedPressableFeedback.focus,
          pressedStyle: sharedPressableFeedback.pressed,
        })}
        disabled={h.busy}
        accessibilityState={{ disabled: h.busy }}
        onPress={h.onSubmitProfile}
      >
        <Text style={styles.primaryButtonText}>{h.busy ? 'Saving...' : 'Save profile'}</Text>
      </Pressable>
      {h.message ? <Text style={styles.message}>{h.message}</Text> : null}
    </View>
  );
}

function PasswordCard({ h }: { h: ProfileScreenHook }) {
  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>Password</Text>
      <Text style={styles.helper}>Update your password for email sign-in.</Text>
      <PasswordInput
        placeholder="New password"
        style={styles.input}
        value={h.newPassword}
        onChangeText={h.setNewPassword}
        showStrength
      />
      <PasswordInput
        placeholder="Confirm new password"
        style={styles.input}
        value={h.confirmNewPassword}
        onChangeText={h.setConfirmNewPassword}
      />
      <Pressable
        style={[styles.secondaryButton, h.passwordBusy && styles.buttonDisabled]}
        disabled={h.passwordBusy}
        accessibilityState={{ disabled: h.passwordBusy }}
        onPress={h.onSubmitPassword}
      >
        <Text style={styles.secondaryButtonText}>
          {h.passwordBusy ? 'Updating password...' : 'Update password'}
        </Text>
      </Pressable>
      {h.passwordMessage ? <Text style={styles.message}>{h.passwordMessage}</Text> : null}
    </View>
  );
}

function DeleteAccountCard({ h }: { h: ProfileScreenHook }) {
  return (
    <View style={[styles.card, styles.dangerCard]}>
      <Text style={styles.sectionTitle}>Delete Account</Text>
      <Text style={styles.helper}>
        Delete your account and sign in information directly in the app. This action is permanent.
      </Text>
      <Text style={styles.label}>Type DELETE to confirm</Text>
      <TextInput
        autoCapitalize="characters"
        placeholder="DELETE"
        style={styles.input}
        value={h.deleteConfirmText}
        onChangeText={h.setDeleteConfirmText}
        editable={!h.deleteBusy}
      />
      <Pressable
        style={interactivePressableStyle({
          base: styles.deleteAccountButton,
          disabled: h.deleteDisabled,
          disabledStyle: styles.buttonDisabled,
          hoverStyle: sharedPressableFeedback.hover,
          focusStyle: sharedPressableFeedback.focus,
          pressedStyle: sharedPressableFeedback.pressed,
        })}
        disabled={h.deleteDisabled}
        accessibilityState={{ disabled: h.deleteDisabled }}
        onPress={h.onDeleteAccount}
      >
        <Text style={styles.deleteAccountButtonText}>
          {h.deleteBusy ? 'Deleting account...' : 'Delete my account permanently'}
        </Text>
      </Pressable>
      {h.deleteMessage ? <Text style={styles.error}>{h.deleteMessage}</Text> : null}
    </View>
  );
}

export function ProfileScreen() {
  const h = useProfileScreen();

  return (
    <ScreenShell>
      <Text style={styles.title}>Profile</Text>

      {h.profile ? (
        <>
          <EmailCard h={h} />
          <ProfileDetailsCard h={h} />
          <PasswordCard h={h} />
          <CalendarSyncCard />
          <DeleteAccountCard h={h} />
        </>
      ) : h.isHydratingProfile ? (
        <View style={styles.placeholderCard}>
          <Text style={styles.placeholderText}>Loading your profile...</Text>
        </View>
      ) : (
        <View style={styles.placeholderCard}>
          <Text style={styles.placeholderText}>
            {h.profileLoadError ?? 'Profile information is not available yet.'}
          </Text>
          <Pressable
            style={interactivePressableStyle({
              base: styles.retryButton,
              disabled: h.isSigningOut,
              hoverStyle: sharedPressableFeedback.hover,
              focusStyle: sharedPressableFeedback.focus,
              pressedStyle: sharedPressableFeedback.pressed,
            })}
            disabled={h.isSigningOut}
            onPress={h.onRetryProfile}
          >
            <Text style={styles.retryButtonText}>Retry profile</Text>
          </Pressable>
        </View>
      )}

      {h.authNotice ? <Text style={styles.error}>{h.authNotice}</Text> : null}

      <SignOutButton isSigningOut={h.isSigningOut} onSignOut={h.onSignOut} />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  buttonDisabled: {
    opacity: 0.6,
  },
  card: {
    backgroundColor: uiColors.surface,
    borderColor: uiColors.border,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
    padding: 12,
  },
  dangerCard: {
    borderColor: uiColors.errorBorder,
    backgroundColor: uiColors.errorBackground,
  },
  deleteAccountButton: {
    alignItems: 'center',
    backgroundColor: uiColors.danger,
    borderRadius: 10,
    padding: 12,
  },
  deleteAccountButtonText: {
    color: uiColors.dangerText,
    fontWeight: '700',
  },
  checkbox: {
    color: uiColors.textPrimary,
    fontSize: 14,
  },
  error: {
    color: uiColors.error,
    fontSize: 12,
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
  helper: {
    color: uiColors.textMuted,
    fontSize: 12,
  },
  input: {
    backgroundColor: uiColors.surface,
    borderColor: uiColors.borderStrong,
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
  },
  label: {
    color: uiColors.textMuted,
    fontSize: 12,
    textTransform: 'uppercase',
  },
  message: {
    color: uiColors.textPrimary,
    fontSize: 13,
  },
  option: {
    backgroundColor: uiColors.divider,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  optionSelected: {
    backgroundColor: uiColors.primary,
  },
  optionText: {
    color: uiColors.textPrimary,
    fontSize: 12,
    fontWeight: '600',
  },
  optionTextSelected: {
    color: uiColors.surface,
    fontSize: 12,
    fontWeight: '700',
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
  placeholderCard: {
    backgroundColor: uiColors.surface,
    borderColor: uiColors.border,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
    padding: 12,
  },
  placeholderText: {
    color: uiColors.textSecondary,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: uiColors.primary,
    borderRadius: 10,
    padding: 12,
  },
  primaryButtonText: {
    color: uiColors.primaryText,
    fontWeight: '700',
  },
  retryButton: {
    alignItems: 'center',
    backgroundColor: uiColors.divider,
    borderRadius: 8,
    padding: 10,
  },
  retryButtonText: {
    color: uiColors.textPrimary,
    fontWeight: '600',
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: uiColors.divider,
    borderRadius: 10,
    padding: 12,
  },
  secondaryButtonText: {
    color: uiColors.textPrimary,
    fontWeight: '700',
  },
  valueText: {
    color: uiColors.textPrimary,
  },
  valueTextPlaceholder: {
    color: uiColors.textSecondary,
  },
  sectionTitle: {
    color: uiColors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  title: {
    color: uiColors.textPrimary,
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
