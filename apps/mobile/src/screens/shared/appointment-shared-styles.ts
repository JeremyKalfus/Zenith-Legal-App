import { uiColors } from '../../theme/colors';

export const appointmentSharedStyles = {
  body: {
    color: uiColors.textSecondary,
  },
  card: {
    backgroundColor: uiColors.surface,
    borderColor: uiColors.border,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
    padding: 12,
  },
  cardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cardTitle: {
    color: uiColors.textPrimary,
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  cardTime: {
    color: uiColors.link,
    fontSize: 13,
  },
  cardDetail: {
    color: uiColors.textSecondary,
    fontSize: 13,
  },
  cardDescription: {
    color: uiColors.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  emptyState: {
    color: uiColors.textPlaceholder,
    fontSize: 14,
    fontStyle: 'italic',
    paddingVertical: 16,
    textAlign: 'center',
  },
  formCard: {
    backgroundColor: uiColors.surface,
    borderColor: uiColors.border,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
    padding: 12,
  },
  helperText: {
    color: uiColors.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },
  input: {
    backgroundColor: uiColors.surface,
    borderColor: uiColors.borderStrong,
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
  },
  pickerDone: {
    alignItems: 'center',
    paddingBottom: 6,
  },
  pickerDoneText: {
    color: uiColors.success,
    fontWeight: '700',
  },
  pickerShell: {
    borderColor: uiColors.borderStrong,
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  primaryCta: {
    alignItems: 'center',
    backgroundColor: uiColors.primary,
    borderRadius: 10,
    padding: 12,
  },
  primaryCtaDisabled: {
    opacity: 0.6,
  },
  primaryCtaText: {
    color: uiColors.primaryText,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  statusBadge: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  tag: {
    backgroundColor: uiColors.divider,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  tagSelected: {
    backgroundColor: uiColors.selectedBackground,
  },
  textArea: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  title: {
    color: uiColors.textPrimary,
    fontSize: 24,
    fontWeight: '700',
  },
  valueText: {
    color: uiColors.textPrimary,
  },
} as const;
