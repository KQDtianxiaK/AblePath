import { describe, expect, it } from 'vitest';

import { ApiRequestError, errorMessage, isSetupRequiredError } from './api';

describe('API errors', () => {
  it('preserves setup-required metadata from server errors', () => {
    const err = new ApiRequestError(424, {
      error: 'No screen capture backend found.',
      code: 'setup-required',
      setupHints: ['Install a screenshot tool.'],
    });

    expect(err.message).toBe('No screen capture backend found.');
    expect(err.status).toBe(424);
    expect(isSetupRequiredError(err)).toBe(true);
    expect(err.setupHints).toEqual(['Install a screenshot tool.']);
  });

  it('formats generic errors without setup metadata', () => {
    const err = new ApiRequestError(500, { error: 'Unexpected failure' });

    expect(isSetupRequiredError(err)).toBe(false);
    expect(errorMessage(err)).toBe('Unexpected failure');
    expect(errorMessage('plain')).toBe('plain');
  });
});
