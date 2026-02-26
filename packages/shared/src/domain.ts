import { z } from 'zod';
import { normalizePhoneNumber, PHONE_VALIDATION_MESSAGES } from './phone';

export const USER_ROLES = ['candidate', 'staff'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const CITY_OPTIONS = [
  'DC',
  'NYC',
  'Boston',
  'Houston',
  'Dallas',
  'Chicago',
  'Atlanta',
  'Charlotte',
  'LA / Southern Cal',
  'SF / Northern Cal',
  'Miami',
  'Denver',
  'Philadelphia',
  'Seattle',
  'Other',
] as const;
export type CityOption = (typeof CITY_OPTIONS)[number];

export const PRACTICE_AREAS = [
  'Antitrust',
  'White Collar',
  "Int'l arb",
  "Int'l reg",
  'Gov Contracts',
  'SEC / CFTC',
  'IP / Tech Trans',
  'Labor & Employment',
  'Litigation',
  'Corp: M&A/PE',
  'Corp: Finance',
  'Corp: EC/VC',
  'Corp: Cap Mkts',
  'Real Estate',
  'Tax & Benefits',
  'Other',
] as const;
export type PracticeArea = (typeof PRACTICE_AREAS)[number];
const practiceAreaSchema = z.enum(PRACTICE_AREAS);

export const FIRM_STATUSES = [
  'Waiting on your authorization to contact/submit',
  'Authorized, will submit soon',
  'Submitted, waiting to hear from firm',
  'Interview Stage',
  'Rejected by firm',
  'Offer received!',
] as const;
export type FirmStatus = (typeof FIRM_STATUSES)[number];

const trimmedString = z.string().trim();

function optionalTrimmedString(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length === 0 ? undefined : value))
    .optional()
    .transform((value) => value ?? undefined);
}

const optionalMobileInputSchema = z
  .string()
  .trim()
  .max(30)
  .transform((value, ctx) => {
    if (value.length === 0) {
      return undefined;
    }

    const normalized = normalizePhoneNumber(value);
    if (!normalized.ok) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: PHONE_VALIDATION_MESSAGES.invalidMobile,
      });
      return z.NEVER;
    }

    return normalized.e164;
  })
  .optional()
  .transform((value) => value ?? undefined);

export const candidateIntakeSchema = z
  .object({
    name: optionalTrimmedString(120),
    email: trimmedString.email('Enter a valid email address').max(255),
    mobile: optionalMobileInputSchema,
    preferredCities: z.array(z.enum(CITY_OPTIONS)).default([]),
    otherCityText: optionalTrimmedString(120),
    practiceAreas: z.array(practiceAreaSchema).max(3, 'Choose up to 3 practice areas').default([]),
    otherPracticeText: optionalTrimmedString(120),
    acceptedPrivacyPolicy: z.boolean().refine((value) => value, {
      message: 'Privacy policy acceptance is required',
    }),
    acceptedCommunicationConsent: z.boolean().refine((value) => value, {
      message: 'Communication consent is required',
    }),
  })
  .superRefine((data, ctx) => {
    const selectedOtherCity = data.preferredCities.includes('Other');
    if (selectedOtherCity && !data.otherCityText) {
      ctx.addIssue({
        path: ['otherCityText'],
        code: z.ZodIssueCode.custom,
        message: 'Please specify your preferred city',
      });
    }

    if (data.practiceAreas.includes('Other') && !data.otherPracticeText) {
      ctx.addIssue({
        path: ['otherPracticeText'],
        code: z.ZodIssueCode.custom,
        message: 'Please specify your practice area',
      });
    }
  });

export type CandidateIntake = z.infer<typeof candidateIntakeSchema>;

export const candidateRegistrationSchema = candidateIntakeSchema
  .extend({
    password: trimmedString.min(6, 'Password must be at least 6 characters').max(256),
    confirmPassword: trimmedString.min(1, 'Please confirm your password').max(256),
  })
  .superRefine((data, ctx) => {
    if (data.password !== data.confirmPassword) {
      ctx.addIssue({
        path: ['confirmPassword'],
        code: z.ZodIssueCode.custom,
        message: 'Passwords do not match',
      });
    }
  });

export type CandidateRegistration = z.infer<typeof candidateRegistrationSchema>;

export const APPOINTMENT_STATUSES = [
  'pending',
  'scheduled',
  'accepted',
  'declined',
  'cancelled',
] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export const appointmentStatusSchema = z.enum(APPOINTMENT_STATUSES);

export const appointmentModalitySchema = z.enum(['virtual', 'in_person']);
export type AppointmentModality = z.infer<typeof appointmentModalitySchema>;

export const appointmentSchema = z
  .object({
    title: trimmedString.min(1, 'Title is required').max(120),
    description: trimmedString.max(2000).optional(),
    modality: appointmentModalitySchema,
    locationText: trimmedString.max(255).optional(),
    videoUrl: trimmedString.url('Must be a valid URL').max(500).optional(),
    startAtUtc: z.string().datetime(),
    endAtUtc: z.string().datetime(),
    timezoneLabel: trimmedString.min(1).max(64),
  })
  .superRefine((data, ctx) => {
    const start = Date.parse(data.startAtUtc);
    const end = Date.parse(data.endAtUtc);
    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
      ctx.addIssue({
        path: ['endAtUtc'],
        code: z.ZodIssueCode.custom,
        message: 'End time must be after start time',
      });
    }
  });

export type AppointmentInput = z.infer<typeof appointmentSchema>;

export const appointmentReviewSchema = z.object({
  appointment_id: z.string().uuid(),
  decision: z.enum(['accepted', 'declined']),
});

export type AppointmentReview = z.infer<typeof appointmentReviewSchema>;

export const notificationEventSchema = z.enum([
  'message.new',
  'appointment.created',
  'appointment.updated',
  'appointment.cancelled',
  'firm_status.updated',
]);

export type NotificationEvent = z.infer<typeof notificationEventSchema>;
