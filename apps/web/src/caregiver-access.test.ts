import { describe, expect, it } from 'vitest';

import {
  bootstrapCaregiverToken,
  buildCaregiverPairingLink,
  CAREGIVER_TOKEN_STORAGE_KEY,
  clearSavedCaregiverToken,
  copyCaregiverPairingLink,
  loadSavedCaregiverToken,
  normalizeCaregiverTokenDays,
  readCaregiverTokenFromFragment,
  saveCaregiverToken,
  type KeyValueStorage,
} from './caregiver-access';

class MemoryStorage implements KeyValueStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe('caregiver access helpers', () => {
  it('reads token and access_token from URL fragments', () => {
    expect(readCaregiverTokenFromFragment('#token=abc123')).toBe('abc123');
    expect(readCaregiverTokenFromFragment('access_token=xyz%20123')).toBe('xyz 123');
    expect(readCaregiverTokenFromFragment('#token=%20trimmed%20')).toBe('trimmed');
    expect(readCaregiverTokenFromFragment('#section=summary')).toBe('');
  });

  it('builds caregiver pairing links with encoded fragment tokens', () => {
    expect(buildCaregiverPairingLink('http://localhost:4317', 'abc 123+/')).toBe(
      'http://localhost:4317/caregiver#token=abc%20123%2B%2F',
    );
  });

  it('bootstraps fragment tokens and removes the token from the visible URL', () => {
    const storage = new MemoryStorage();
    storage.setItem(CAREGIVER_TOKEN_STORAGE_KEY, 'saved-token');
    let replaced: { data: unknown; title: string; url?: string | URL | null } | null = null;

    const result = bootstrapCaregiverToken({
      hash: '#token=fragment-token',
      pathname: '/caregiver',
      title: 'AblePath',
      storage,
      history: {
        replaceState: (data, title, url) => {
          replaced = { data, title, url };
        },
      },
    });

    expect(result).toEqual({
      token: 'fragment-token',
      saved: false,
      fromFragment: true,
    });
    expect(replaced).toEqual({ data: null, title: 'AblePath', url: '/caregiver' });
  });

  it('prefers fragment tokens over saved tokens without overwriting storage', () => {
    const storage = new MemoryStorage();
    storage.setItem(CAREGIVER_TOKEN_STORAGE_KEY, 'saved-token');

    const result = bootstrapCaregiverToken({
      hash: '#access_token=fragment-token',
      pathname: '/caregiver',
      title: 'AblePath',
      storage,
    });

    expect(result.token).toBe('fragment-token');
    expect(result.saved).toBe(false);
    expect(result.fromFragment).toBe(true);
    expect(storage.getItem(CAREGIVER_TOKEN_STORAGE_KEY)).toBe('saved-token');
  });

  it('loads saved caregiver tokens when there is no fragment token', () => {
    const storage = new MemoryStorage();
    storage.setItem(CAREGIVER_TOKEN_STORAGE_KEY, 'saved-token');
    let replaceCalled = false;

    const result = bootstrapCaregiverToken({
      hash: '#section=summary',
      pathname: '/caregiver',
      title: 'AblePath',
      storage,
      history: {
        replaceState: () => {
          replaceCalled = true;
        },
      },
    });

    expect(result).toEqual({
      token: 'saved-token',
      saved: true,
      fromFragment: false,
    });
    expect(replaceCalled).toBe(false);
  });

  it('normalizes caregiver token expiry days for frontend submission', () => {
    expect(normalizeCaregiverTokenDays(1)).toBe(1);
    expect(normalizeCaregiverTokenDays(7.4)).toBe(7);
    expect(normalizeCaregiverTokenDays(7.5)).toBe(8);
    expect(normalizeCaregiverTokenDays(0)).toBe(1);
    expect(normalizeCaregiverTokenDays(-20)).toBe(1);
    expect(normalizeCaregiverTokenDays(999)).toBe(365);
    expect(normalizeCaregiverTokenDays('90')).toBe(90);
    expect(normalizeCaregiverTokenDays('bad')).toBe(30);
  });

  it('copies caregiver pairing links when clipboard is available', async () => {
    let copied = '';
    const result = await copyCaregiverPairingLink(
      {
        writeText: async (text) => {
          copied = text;
        },
      },
      'http://localhost:4317/caregiver#token=abc',
    );

    expect(result).toEqual({ ok: true, message: '看护链接已复制。' });
    expect(copied).toBe('http://localhost:4317/caregiver#token=abc');
  });

  it('reports unsupported clipboard and copy failures', async () => {
    const unsupported = await copyCaregiverPairingLink(undefined, 'link');
    const failed = await copyCaregiverPairingLink(
      {
        writeText: async () => {
          throw new Error('denied');
        },
      },
      'link',
    );

    expect(unsupported.ok).toBe(false);
    expect(unsupported.message).toContain('不支持自动复制');
    expect(failed).toEqual({ ok: false, error: 'denied' });
  });

  it('saves, loads, and clears caregiver tokens through storage', () => {
    const storage = new MemoryStorage();

    expect(loadSavedCaregiverToken(storage)).toBe('');
    expect(saveCaregiverToken(storage, '  token-value  ')).toBe('token-value');
    expect(storage.getItem(CAREGIVER_TOKEN_STORAGE_KEY)).toBe('token-value');
    expect(loadSavedCaregiverToken(storage)).toBe('token-value');

    clearSavedCaregiverToken(storage);
    expect(loadSavedCaregiverToken(storage)).toBe('');
  });

  it('does not save blank caregiver tokens', () => {
    const storage = new MemoryStorage();

    expect(saveCaregiverToken(storage, '   ')).toBe('');
    expect(storage.getItem(CAREGIVER_TOKEN_STORAGE_KEY)).toBeNull();
  });
});
