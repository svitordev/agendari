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

  it('17. 401 comum fora do login mantém redirect e limpa token', async () => {
    localStorage.setItem('token', 't');
    setPathname('/dashboard');
    const error = { response: { status: 401 }, config: { url: '/auth/profile' } };
    await expect(getResponseErrorHandler()(error)).rejects.toBe(error);
    expect(localStorage.getItem('token')).toBeNull();
    expect(window.location.href).toBe('/login');
  });
});

/*
 * ========================================================
 * SUSPENSÃO — sessão já ativa (403 com a mensagem exata do
 * backend). Cada teste recarrega o módulo via vi.resetModules
 * + reset explícito da flag de redirect (a factory do mock do
 * axios é cacheada por arquivo — ver lib/api.ts).
 * ========================================================
 */

type FreshInstance = {
  interceptors: {
    request: { use: ReturnType<typeof vi.fn> };
    response: { use: ReturnType<typeof vi.fn> };
  };
};

async function freshHandler(): Promise<(error: unknown) => Promise<unknown>> {
  vi.resetModules();
  const axiosMod = (await import('axios')) as unknown as {
    default: { create: () => FreshInstance; __instance: FreshInstance };
  };
  const apiMod = (await import('@/lib/api')) as unknown as {
    __resetAccountStateRedirectForTest?: () => void;
  };
  // Garante flag limpa mesmo quando o factory mock não é re-executado entre
  // testes (o handler usado é o do módulo importado acima — última chamada).
  apiMod.__resetAccountStateRedirectForTest?.();
  const calls =
    axiosMod.default.__instance.interceptors.response.use.mock.calls;
  const call = calls[calls.length - 1];
  return call![1] as (error: unknown) => Promise<unknown>;
}

function trackLocation(pathname: string) {
  const state = { href: '', sets: 0 };
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: {
      pathname,
      get href() {
        return state.href;
      },
      set href(v: string) {
        state.href = v;
        state.sets += 1;
      },
    },
  });
  return state;
}

const SUSP_MSG = 'Conta suspensa. Entre em contato com o administrador.';

describe('interceptor — conta suspensa', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('18. 403 suspensão em request privada remove token e redireciona', async () => {
    localStorage.setItem('token', 't');
    const loc = trackLocation('/dashboard');
    const handler = await freshHandler();
    const error = {
      config: { url: '/auth/profile' },
      response: { status: 403, data: { message: SUSP_MSG } },
    };
    await expect(handler(error)).rejects.toBe(error);
    expect(localStorage.getItem('token')).toBeNull();
    expect(loc.href).toBe('/login?reason=suspended');
    expect(loc.sets).toBe(1);
  });

  it('19. 403 suspensão no próprio POST /auth/login NÃO faz tratamento global', async () => {
    localStorage.setItem('token', 'keep-me');
    const loc = trackLocation('/login');
    const handler = await freshHandler();
    const error = {
      config: { url: '/auth/login' },
      response: { status: 403, data: { message: SUSP_MSG } },
    };
    await expect(handler(error)).rejects.toBe(error);
    // A página de login trata inline: sem logout extra e sem redirect.
    expect(localStorage.getItem('token')).toBe('keep-me');
    expect(loc.sets).toBe(0);
  });

  it('20. 403 comum NÃO remove token e NÃO redireciona', async () => {
    localStorage.setItem('token', 't');
    const loc = trackLocation('/dashboard');
    const handler = await freshHandler();
    const error = {
      config: { url: '/services' },
      response: { status: 403, data: { message: 'Permissão insuficiente.' } },
    };
    await expect(handler(error)).rejects.toBe(error);
    expect(localStorage.getItem('token')).toBe('t');
    expect(loc.sets).toBe(0);
  });

  it('21. 403 comum de ADMIN não é tratado como suspensão', async () => {
    localStorage.setItem('token', 't');
    const loc = trackLocation('/admin/professionals');
    const handler = await freshHandler();
    const error = {
      config: { url: '/admin/professionals/cmung4v4x0000t9gcziccm7zz/status' },
      response: { status: 403, data: { message: 'Permissão insuficiente.' } },
    };
    await expect(handler(error)).rejects.toBe(error);
    expect(localStorage.getItem('token')).toBe('t');
    expect(loc.sets).toBe(0);
  });

  it('22. múltiplos 403 de suspensão simultâneos produzem um único redirect', async () => {
    localStorage.setItem('token', 't');
    const loc = trackLocation('/dashboard');
    const handler = await freshHandler();
    const e1 = {
      config: { url: '/auth/profile' },
      response: { status: 403, data: { message: SUSP_MSG } },
    };
    const e2 = {
      config: { url: '/appointments?professionalId=x' },
      response: { status: 403, data: { message: SUSP_MSG } },
    };
    await expect(handler(e1)).rejects.toBe(e1);
    await expect(handler(e2)).rejects.toBe(e2);
    expect(loc.sets).toBe(1);
    expect(loc.href).toBe('/login?reason=suspended');
    expect(localStorage.getItem('token')).toBeNull();
  });

  it('23. mensagem parecida mas não exata não é tratada como suspensão', async () => {
    localStorage.setItem('token', 't');
    const loc = trackLocation('/dashboard');
    const handler = await freshHandler();
    const error = {
      config: { url: '/auth/profile' },
      response: { status: 403, data: { message: 'Conta suspensa' } },
    };
    await expect(handler(error)).rejects.toBe(error);
    expect(localStorage.getItem('token')).toBe('t');
    expect(loc.sets).toBe(0);
  });

  it('24. 403 de booking público (mensagem própria) não dispara logout de sessão', async () => {
    localStorage.setItem('token', 't');
    const loc = trackLocation('/professional/jessicasantana');
    const handler = await freshHandler();
    const error = {
      config: { url: '/appointments' },
      response: {
        status: 403,
        data: {
          message:
            'Este profissional não está aceitando novos agendamentos no momento.',
        },
      },
    };
    await expect(handler(error)).rejects.toBe(error);
    expect(localStorage.getItem('token')).toBe('t');
    expect(loc.sets).toBe(0);
  });

  it('25. isLoginRequest cobre config.url sem barra inicial (auth/login)', async () => {
    localStorage.setItem('token', 'keep-me');
    const loc = trackLocation('/login');
    const handler = await freshHandler();
    const error = {
      config: { url: 'auth/login' },
      response: { status: 403, data: { message: SUSP_MSG } },
    };
    await expect(handler(error)).rejects.toBe(error);
    expect(localStorage.getItem('token')).toBe('keep-me');
    expect(loc.sets).toBe(0);
  });

  it('26. isLoginRequest cobre URL completa com base (axios pode enviar assim)', async () => {
    localStorage.setItem('token', 'keep-me');
    const loc = trackLocation('/login');
    const handler = await freshHandler();
    const error = {
      config: { url: 'https://api.example.com/auth/login' },
      response: { status: 403, data: { message: SUSP_MSG } },
    };
    await expect(handler(error)).rejects.toBe(error);
    expect(localStorage.getItem('token')).toBe('keep-me');
    expect(loc.sets).toBe(0);
  });
});

/*
 * ========================================================
 * PERFIL ARQUIVADO — 403 com a mensagem exata do backend
 * (auth.service.ts/jwt.strategy.ts). Flag de redirect
 * compartilhada com suspensão — um único redirect por sessão.
 * ========================================================
 */

const ARCH_MSG = 'Este perfil foi desativado. Entre em contato com o administrador.';

describe('interceptor — perfil arquivado', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('27. 403 archived em request privada remove token e redireciona', async () => {
    localStorage.setItem('token', 't');
    const loc = trackLocation('/dashboard');
    const handler = await freshHandler();
    const error = {
      config: { url: '/auth/profile' },
      response: { status: 403, data: { message: ARCH_MSG } },
    };
    await expect(handler(error)).rejects.toBe(error);
    expect(localStorage.getItem('token')).toBeNull();
    expect(loc.href).toBe('/login?reason=archived');
    expect(loc.sets).toBe(1);
  });

  it('28. múltiplos 403 archived simultâneos produzem um único redirect', async () => {
    localStorage.setItem('token', 't');
    const loc = trackLocation('/dashboard');
    const handler = await freshHandler();
    const e1 = {
      config: { url: '/auth/profile' },
      response: { status: 403, data: { message: ARCH_MSG } },
    };
    const e2 = {
      config: { url: '/appointments?professionalId=x' },
      response: { status: 403, data: { message: ARCH_MSG } },
    };
    await expect(handler(e1)).rejects.toBe(e1);
    await expect(handler(e2)).rejects.toBe(e2);
    expect(loc.sets).toBe(1);
    expect(loc.href).toBe('/login?reason=archived');
  });

  it('29. flag compartilhada: suspended + archived juntos produzem um único redirect', async () => {
    localStorage.setItem('token', 't');
    const loc = trackLocation('/dashboard');
    const handler = await freshHandler();
    const e1 = {
      config: { url: '/auth/profile' },
      response: { status: 403, data: { message: SUSP_MSG } },
    };
    const e2 = {
      config: { url: '/services' },
      response: { status: 403, data: { message: ARCH_MSG } },
    };
    await expect(handler(e1)).rejects.toBe(e1);
    await expect(handler(e2)).rejects.toBe(e2);
    expect(loc.sets).toBe(1); // primeiro vence; token removido nos dois
    expect(loc.href).toBe('/login?reason=suspended');
    expect(localStorage.getItem('token')).toBeNull();
  });

  it('30. 403 archived no próprio POST /auth/login NÃO faz tratamento global', async () => {
    localStorage.setItem('token', 'keep-me');
    const loc = trackLocation('/login');
    const handler = await freshHandler();
    const error = {
      config: { url: '/auth/login' },
      response: { status: 403, data: { message: ARCH_MSG } },
    };
    await expect(handler(error)).rejects.toBe(error);
    expect(localStorage.getItem('token')).toBe('keep-me');
    expect(loc.sets).toBe(0);
  });

  it('31. archived com url sem barra inicial (auth/login) é excluído do redirect', async () => {
    localStorage.setItem('token', 'keep-me');
    const loc = trackLocation('/login');
    const handler = await freshHandler();
    const error = {
      config: { url: 'auth/login' },
      response: { status: 403, data: { message: ARCH_MSG } },
    };
    await expect(handler(error)).rejects.toBe(error);
    expect(localStorage.getItem('token')).toBe('keep-me');
    expect(loc.sets).toBe(0);
  });

  it('32. archived com URL completa com base é excluído do redirect', async () => {
    localStorage.setItem('token', 'keep-me');
    const loc = trackLocation('/login');
    const handler = await freshHandler();
    const error = {
      config: { url: 'https://api.example.com/auth/login' },
      response: { status: 403, data: { message: ARCH_MSG } },
    };
    await expect(handler(error)).rejects.toBe(error);
    expect(localStorage.getItem('token')).toBe('keep-me');
    expect(loc.sets).toBe(0);
  });

  it('33. mensagem parecida mas não exata não é tratada como archived', async () => {
    localStorage.setItem('token', 't');
    const loc = trackLocation('/dashboard');
    const handler = await freshHandler();
    const error = {
      config: { url: '/auth/profile' },
      response: { status: 403, data: { message: 'Este perfil foi desativado' } },
    };
    await expect(handler(error)).rejects.toBe(error);
    expect(localStorage.getItem('token')).toBe('t');
    expect(loc.sets).toBe(0);
  });

  it('34. 403 comum não vira archived (sem logout/redirect)', async () => {
    localStorage.setItem('token', 't');
    const loc = trackLocation('/dashboard');
    const handler = await freshHandler();
    const error = {
      config: { url: '/services' },
      response: { status: 403, data: { message: 'Permissão insuficiente.' } },
    };
    await expect(handler(error)).rejects.toBe(error);
    expect(localStorage.getItem('token')).toBe('t');
    expect(loc.sets).toBe(0);
  });

  it('35. 403 de booking público (mensagem própria) não dispara logout archived', async () => {
    localStorage.setItem('token', 't');
    const loc = trackLocation('/professional/jessicasantana');
    const handler = await freshHandler();
    const error = {
      config: { url: '/appointments' },
      response: {
        status: 403,
        data: {
          message:
            'Este profissional não está aceitando novos agendamentos no momento.',
        },
      },
    };
    await expect(handler(error)).rejects.toBe(error);
    expect(localStorage.getItem('token')).toBe('t');
    expect(loc.sets).toBe(0);
  });

  it('36. regressão: mensagem exata de suspensão segue redirecionando para suspended', async () => {
    localStorage.setItem('token', 't');
    const loc = trackLocation('/dashboard');
    const handler = await freshHandler();
    const error = {
      config: { url: '/auth/profile' },
      response: { status: 403, data: { message: SUSP_MSG } },
    };
    await expect(handler(error)).rejects.toBe(error);
    expect(localStorage.getItem('token')).toBeNull();
    expect(loc.href).toBe('/login?reason=suspended');
    expect(loc.sets).toBe(1);
  });

  it('37. archived em página /admin/* vai para /login?reason=archived (destino único)', async () => {
    localStorage.setItem('token', 't');
    const loc = trackLocation('/admin/professionals');
    const handler = await freshHandler();
    const error = {
      config: { url: '/admin/professionals' },
      response: { status: 403, data: { message: ARCH_MSG } },
    };
    await expect(handler(error)).rejects.toBe(error);
    expect(localStorage.getItem('token')).toBeNull();
    expect(loc.href).toBe('/login?reason=archived');
    expect(loc.sets).toBe(1);
  });

  it('38. cross-state inverso: archived primeiro, suspended depois → um único redirect', async () => {
    localStorage.setItem('token', 't');
    const loc = trackLocation('/dashboard');
    const handler = await freshHandler();
    const e1 = {
      config: { url: '/auth/profile' },
      response: { status: 403, data: { message: ARCH_MSG } },
    };
    const e2 = {
      config: { url: '/services' },
      response: { status: 403, data: { message: SUSP_MSG } },
    };
    await expect(handler(e1)).rejects.toBe(e1);
    await expect(handler(e2)).rejects.toBe(e2);
    // O segundo não pode sobrescrever o destino já iniciado.
    expect(loc.sets).toBe(1);
    expect(loc.href).toBe('/login?reason=archived');
    expect(localStorage.getItem('token')).toBeNull();
  });
});
