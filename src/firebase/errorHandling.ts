import { auth } from './config';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid ?? null,
      email: auth.currentUser?.email ?? null,
      emailVerified: auth.currentUser?.emailVerified ?? null,
      isAnonymous: auth.currentUser?.isAnonymous ?? null,
      tenantId: auth.currentUser?.tenantId ?? null,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function isQuotaExceededError(error: unknown): boolean {
  if (!error) return false;
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = String((error as { code?: unknown }).code || '').toLowerCase();
    if (code === 'resource-exhausted' || code.includes('resource-exhausted')) return true;
  }
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return msg.includes('quota exceeded') || msg.includes('resource-exhausted');
}

export function formatFriendlyFirestoreError(
  error: unknown,
  fallback = 'Database operation could not be completed. Please try again.'
): string {
  if (!error) return fallback;
  const dailyLimitMsg =
    'Daily free Firebase database write limit reached for today. Writes resume automatically after the daily midnight Pacific reset.';
  if (isQuotaExceededError(error)) {
    return dailyLimitMsg;
  }

  const raw = error instanceof Error ? error.message : String(error);
  if (raw.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(raw) as { error?: string };
      if (parsed.error) {
        if (isQuotaExceededError(parsed.error)) {
          return dailyLimitMsg;
        }
        return parsed.error;
      }
    } catch {
      // ignore invalid JSON
    }
  }
  return raw || fallback;
}

export async function withFirestoreTimeout<T>(
  promise: Promise<T>,
  timeoutMs = 8000,
  timeoutMessage = 'Request timed out while contacting the database. Please check your connection or daily Firebase write limit.'
): Promise<T> {
  let timerId: number | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timerId = window.setTimeout(() => {
          reject(new Error(timeoutMessage));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timerId !== undefined) {
      window.clearTimeout(timerId);
    }
  }
}

