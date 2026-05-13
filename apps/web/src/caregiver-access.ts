export const CAREGIVER_TOKEN_STORAGE_KEY = 'ablepath.caregiverToken';

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface ClipboardLike {
  writeText(text: string): Promise<void>;
}

export interface CopyLinkResult {
  ok: boolean;
  message?: string;
  error?: string;
}

export interface CaregiverTokenBootstrapInput {
  hash: string;
  pathname: string;
  title: string;
  storage: KeyValueStorage;
  history?: {
    replaceState(data: unknown, title: string, url?: string | URL | null): void;
  };
}

export interface CaregiverTokenBootstrapResult {
  token: string;
  saved: boolean;
  fromFragment: boolean;
}

export function readCaregiverTokenFromFragment(hash: string): string {
  const fragment = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!fragment) return '';

  const params = new URLSearchParams(fragment);
  return (params.get('token') ?? params.get('access_token') ?? '').trim();
}

export function bootstrapCaregiverToken(input: CaregiverTokenBootstrapInput): CaregiverTokenBootstrapResult {
  const fragmentToken = readCaregiverTokenFromFragment(input.hash);
  if (fragmentToken) {
    input.history?.replaceState(null, input.title, input.pathname);
    return {
      token: fragmentToken,
      saved: false,
      fromFragment: true,
    };
  }

  const savedToken = loadSavedCaregiverToken(input.storage);
  return {
    token: savedToken,
    saved: Boolean(savedToken),
    fromFragment: false,
  };
}

export function buildCaregiverPairingLink(origin: string, token: string): string {
  return `${origin}/caregiver#token=${encodeURIComponent(token)}`;
}

export function normalizeCaregiverTokenDays(value: unknown): number {
  const days = Number(value);
  if (!Number.isFinite(days)) return 30;
  return Math.max(1, Math.min(365, Math.round(days)));
}

export async function copyCaregiverPairingLink(
  clipboard: ClipboardLike | undefined,
  link: string,
): Promise<CopyLinkResult> {
  if (!clipboard?.writeText) {
    return {
      ok: false,
      message: '当前浏览器不支持自动复制，可手动复制上方链接。',
    };
  }

  try {
    await clipboard.writeText(link);
    return { ok: true, message: '看护链接已复制。' };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function loadSavedCaregiverToken(storage: KeyValueStorage): string {
  return storage.getItem(CAREGIVER_TOKEN_STORAGE_KEY) ?? '';
}

export function saveCaregiverToken(storage: KeyValueStorage, token: string): string {
  const trimmed = token.trim();
  if (!trimmed) return '';
  storage.setItem(CAREGIVER_TOKEN_STORAGE_KEY, trimmed);
  return trimmed;
}

export function clearSavedCaregiverToken(storage: KeyValueStorage): void {
  storage.removeItem(CAREGIVER_TOKEN_STORAGE_KEY);
}
