import axios from 'axios';
import {
  isLoginRequest,
  isSuspendedAccountError,
  SUSPENDED_LOGIN_PATH,
} from './suspension';

// Flag apenas para o redirect de suspensão em andamento — múltiplos 403 de
// suspensão simultâneos produzem um único redirect. O redirect usa
// window.location.href (reload completo), então este module state reseta
// naturalmente na próxima carga da página. A remoção do token acontece antes
// da flag — a sessão é sempre invalidada; apenas o redirect é deduplicado.
let suspensionRedirectInProgress = false;

// Test-only: a factory do vi.mock('axios') é cacheada por arquivo e
// vi.isolateModules não existe no Vitest 3 — sem este reset, a flag vazaria
// entre testes (ver tests/api-interceptor.test.ts).
export function __resetSuspensionRedirectForTest(): void {
  suspensionRedirectInProgress = false;
}

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Adicionar token automaticamente
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Redirecionar para login se token expirar
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      if (typeof window !== 'undefined') {
        if (window.location.pathname === '/admin/login') {
          // Já estamos na tela de login admin: o 401 veio do próprio
          // POST /auth/login (credenciais inválidas). Redirecionar para a
          // mesma URL recarregaria a página e perderia a mensagem de erro.
        } else {
          // Área admin tem login próprio; demais rotas seguem para /login.
          window.location.href = window.location.pathname.startsWith('/admin')
            ? '/admin/login'
            : '/login';
        }
      }
    }
    // Conta suspensa (mensagem exata do backend — ver lib/suspension.ts):
    // sessão invalidada centralmente. O 403 do próprio POST /auth/login é
    // tratado inline pela página de login (sem logout/redirect aqui).
    if (isSuspendedAccountError(error) && !isLoginRequest(error.config)) {
      localStorage.removeItem('token');
      if (typeof window !== 'undefined' && !suspensionRedirectInProgress) {
        suspensionRedirectInProgress = true;
        window.location.href = SUSPENDED_LOGIN_PATH;
      }
    }
    return Promise.reject(error);
  }
);

export default api;