import { describe, it, expect, vi, beforeEach } from 'vitest';

// A factory do vi.mock é içada acima dos consts — a instância nasce dentro dela.
vi.mock('axios', () => {
  const instance = {
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  };
  return { default: { create: () => instance, __instance: instance } };
});

import axios from 'axios';
import '@/lib/api';

const mockInstance = (
  axios as unknown as {
    __instance: {
      interceptors: {
        request: { use: ReturnType<typeof vi.fn> };
        response: { use: ReturnType<typeof vi.fn> };
      };
    };
  }
).__instance;

function getResponseErrorHandler(): (error: unknown) => Promise<unknown> {
  const call = mockInstance.interceptors.response.use.mock.calls[0];
  return call![1] as (error: unknown) => Promise<unknown>;
}

function setPathname(pathname: string) {
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: { href: '', pathname },
  });
}

describe('interceptor 401', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('12. 401 em URL /admin → /admin/login', async () => {
    localStorage.setItem('token', 't');
    setPathname('/admin/professionals');
    const error = { response: { status: 401 } };
    // O interceptor sempre rejeita o erro (comportamento padrão do axios),
    // mesmo após limpar o token e redirecionar.
    await expect(getResponseErrorHandler()(error)).rejects.toBe(error);
    expect(localStorage.getItem('token')).toBeNull();
    expect(window.location.href).toBe('/admin/login');
  });

  it('13. 401 fora de /admin → /login', async () => {
    localStorage.setItem('token', 't');
    setPathname('/dashboard');
    const error = { response: { status: 401 } };
    await expect(getResponseErrorHandler()(error)).rejects.toBe(error);
    expect(localStorage.getItem('token')).toBeNull();
    expect(window.location.href).toBe('/login');
  });

  it('16. 401 do POST /auth/login em /admin/login não recarrega a página', async () => {
    // Credenciais inválidas no login admin: o erro precisa chegar à página
    // para exibir a mensagem — o interceptor não pode recarregar a rota.
    localStorage.setItem('token', 't');
    setPathname('/admin/login');
    const error = { response: { status: 401 }, config: { url: '/auth/login' } };
    await expect(getResponseErrorHandler()(error)).rejects.toBe(error);
    expect(localStorage.getItem('token')).toBeNull();
    expect(window.location.href).toBe(''); // nenhum redirect
  });
});
