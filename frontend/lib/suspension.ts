/*
 * Fonte única de verdade da UX de estado de conta no frontend
 * (suspensão e arquivamento).
 * As mensagens espelham as strings exatas retornadas pelo backend
 * (auth.service.ts e jwt.strategy.ts) — mudar uma ponta exige mudar a outra
 * (coberto por testes nos dois lados).
 */
export const SUSPENDED_ACCOUNT_MESSAGE =
  'Conta suspensa. Entre em contato com o administrador.';

export const SUSPENDED_REASON = 'suspended';

export const SUSPENDED_LOGIN_PATH = '/login?reason=suspended';

export const ARCHIVED_ACCOUNT_MESSAGE =
  'Este perfil foi desativado. Entre em contato com o administrador.';

export const ARCHIVED_REASON = 'archived';

export const ARCHIVED_LOGIN_PATH = '/login?reason=archived';

// Shape estrutural mínima de um erro do Axios (sem `any`).
export type ApiErrorLike = {
  config?: { url?: string };
  response?: { status?: number; data?: { message?: unknown } };
};

export function isLoginRequest(config?: ApiErrorLike['config']): boolean {
  // Cobre '/auth/login' (shape real das chamadas do api centralizado),
  // 'auth/login' sem barra inicial e URL completa com base.
  return (config?.url ?? '').includes('auth/login');
}

export function isSuspendedAccountError(error: ApiErrorLike): boolean {
  return (
    error.response?.status === 403 &&
    error.response?.data?.message === SUSPENDED_ACCOUNT_MESSAGE
  );
}

export function isArchivedAccountError(error: ApiErrorLike): boolean {
  return (
    error.response?.status === 403 &&
    error.response?.data?.message === ARCHIVED_ACCOUNT_MESSAGE
  );
}
