import { describe, expect, it } from 'vitest';
import { getFunctionErrorMessage } from './function-error';

describe('getFunctionErrorMessage', () => {
  it('returns user-friendly message for known error codes', async () => {
    const error = {
      message: 'FunctionsHttpError',
      context: {
        json: async () => ({ code: 'duplicate_assignment' }),
      },
    };

    expect(await getFunctionErrorMessage(error)).toBe(
      'This firm is already assigned to this candidate.',
    );
  });

  it('returns user-friendly message for appointment_not_found', async () => {
    const error = {
      message: 'FunctionsHttpError',
      context: {
        json: async () => ({ code: 'appointment_not_found' }),
      },
    };

    expect(await getFunctionErrorMessage(error)).toBe(
      'That appointment could not be found. Refresh and try again.',
    );
  });

  it('returns error string from payload when no matching code', async () => {
    const error = {
      message: 'FunctionsHttpError',
      context: {
        json: async () => ({ error: 'Custom backend message' }),
      },
    };

    expect(await getFunctionErrorMessage(error)).toBe('Custom backend message');
  });

  it('falls back to error.message when no context', async () => {
    const error = { message: 'Network error' };
    expect(await getFunctionErrorMessage(error)).toBe('Network error');
  });

  it('returns fallback for null error', async () => {
    expect(await getFunctionErrorMessage(null)).toBe(
      'Something went wrong. Please try again.',
    );
  });

  it('returns custom fallback when provided', async () => {
    expect(await getFunctionErrorMessage(null, 'Custom fallback')).toBe(
      'Custom fallback',
    );
  });

  it('handles json() throwing', async () => {
    const error = {
      message: 'FunctionsHttpError',
      context: {
        json: async () => {
          throw new Error('parse error');
        },
      },
    };

    expect(await getFunctionErrorMessage(error)).toBe('FunctionsHttpError');
  });
});
