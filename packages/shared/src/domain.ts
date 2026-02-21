import { z } from 'zod';

export const USER_ROLES = ['candidate', 'staff'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const CITY_OPTIONS = [
  'DC',
  'NYC',
  'Boston',
  'Houston',
  'Dallas',
  'Chicago',
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
  'Regulatory / White Collar',
  'Labor & Employment',
  'General Litigation',
  'Corporate: M&A/PE',
  'Corporate: Finance',
  'Real Estate',
  'Tax & Benefits',
  'Other',
] as const;
export type PracticeArea = (typeof PRACTICE_AREAS)[number];

export const FIRM_STATUSES = [
  'Waiting on your authorization to contact/submit',
  'Submitted, waiting to hear from firm',
  'Interview Stage',
  'Rejected by firm',
  'Offer received!',
] as const;
export type FirmStatus = (typeof FIRM_STATUSES)[number];

const trimmedString = z.string().trim();

export const candidateIntakeSchema = z
  .object({
    name: trimmedString.min(1, 'Name is required').max(120),
    email: trimmedString.email('Enter a valid email address').max(255),
    mobile: trimmedString.min(7, 'Enter a valid mobile number').max(30),
    preferredCities: z.array(z.enum(CITY_OPTIONS)).default([]),
    otherCityText: trimmedString.max(120).optional(),
    practiceArea: z.enum(PRACTICE_AREAS),
    otherPracticeText: trimmedString.max(120).optional(),
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

    if (data.practiceArea === 'Other' && !data.otherPracticeText) {
      ctx.addIssue({
        path: ['otherPracticeText'],
        code: z.ZodIssueCode.custom,
        message: 'Please specify your practice area',
      });
    }
  });

export type CandidateIntake = z.infer<typeof candidateIntakeSchema>;

export const appointmentModalitySchema = z.enum(['virtual', 'in_person']);
export type AppointmentModality = z.infer<typeof appointmentModalitySchema>;

export const appointmentSchema = z
  .object({
    title: trimmedString.min(1).max(120),
    description: trimmedString.max(2000).optional(),
    modality: appointmentModalitySchema,
    locationText: trimmedString.max(255).optional(),
    videoUrl: trimmedString.url().max(500).optional(),
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

    if (data.modality === 'virtual' && !data.videoUrl) {
      ctx.addIssue({
        path: ['videoUrl'],
        code: z.ZodIssueCode.custom,
        message: 'Virtual appointments require a video URL',
      });
    }

    if (data.modality === 'in_person' && !data.locationText) {
      ctx.addIssue({
        path: ['locationText'],
        code: z.ZodIssueCode.custom,
        message: 'In-person appointments require a location',
      });
    }
  });

export type AppointmentInput = z.infer<typeof appointmentSchema>;

export const notificationEventSchema = z.enum([
  'message.new',
  'appointment.created',
  'appointment.updated',
  'appointment.cancelled',
  'firm_status.updated',
]);

export type NotificationEvent = z.infer<typeof notificationEventSchema>;
