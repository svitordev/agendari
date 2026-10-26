import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const mockRouter = { push: vi.fn(), replace: vi.fn() };
let mockQuery = '';

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  useSearchParams: () => new URLSearchParams(mockQuery),
}));

vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
  },
}));

import api from '@/lib/api';
import LoginPage from '@/app/login/page';

const mockPost = vi.mocked(api.post);

const SUSP_MSG = 'Conta suspensa. Entre em contato com o administrador.';

function fillAndSubmit() {
  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: 'pro@test.local' },
  });
  fireEvent.change(screen.getByLabelText('Senha'), {
    target: { value: 'senha' },
  });
  fireEvent.click(screen.getByRole('button', { name: /entrar/i }));
}

function authOk() {
  mockPost.mockResolvedValue({
    data: {
      accessToken: 'tok',
      user: {
        id: 'u1',
        email: 'pro@test.local',
        firstName: 'Ana',
        lastName: 'Pro',
        role: 'PROFESSIONAL',
      },
    },
  });
}

describe('/login — conta suspensa', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockQuery = '';
  });

  it('login suspenso (403) mostra a mensagem correta com role=alert', async () => {
    mockPost.mockRejectedValue({
      response: { status: 403, data: { message: SUSP_MSG } },
    });
    render(<LoginPage />);
    fillAndSubmit();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(SUSP_MSG);
  });

  it('login suspenso NÃO salva token e NÃO redireciona para o dashboard', async () => {
    mockPost.mockRejectedValue({
      response: { status: 403, data: { message: SUSP_MSG } },
    });
    render(<LoginPage />);
    fillAndSubmit();
    expect(await screen.findByText(SUSP_MSG)).toBeInTheDocument();
    expect(localStorage.getItem('token')).toBeNull();
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('senha inválida mantém a mensagem normal de credencial', async () => {
    mockPost.mockRejectedValue({
      response: { status: 401, data: { message: 'Credenciais inválidas.' } },
    });
    render(<LoginPage />);
    fillAndSubmit();
    expect(await screen.findByText('Credenciais inválidas.')).toBeInTheDocument();
    expect(screen.queryByText(SUSP_MSG)).not.toBeInTheDocument();
    expect(localStorage.getItem('token')).toBeNull();
  });

  it('403 comum no login não vira mensagem de suspensão', async () => {
    mockPost.mockRejectedValue({
      response: { status: 403, data: { message: 'Permissão insuficiente.' } },
    });
    render(<LoginPage />);
    fillAndSubmit();
    expect(await screen.findByText('Permissão insuficiente.')).toBeInTheDocument();
    expect(screen.queryByText(SUSP_MSG)).not.toBeInTheDocument();
  });

  it('?reason=suspended mostra o texto fixo local sem submit', async () => {
    mockQuery = 'reason=suspended';
    render(<LoginPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent(SUSP_MSG);
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('query arbitrária não é renderizada como mensagem', async () => {
    mockQuery = 'reason=<script>alert(1)</script>';
    render(<LoginPage />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain('<script>');
    expect(document.body.textContent).not.toContain('alert(1)');
  });

  it('query foo e mensagem URL-encoded não são refletidas como aviso', async () => {
    mockQuery = 'reason=foo';
    const { unmount } = render(<LoginPage />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    unmount();

    mockQuery = `reason=${encodeURIComponent(SUSP_MSG)}`;
    render(<LoginPage />);
    // A query só vira aviso quando vale exatamente 'suspended'; a mensagem
    // espelhada na URL não deve ser renderizada pela query (nem duplicar).
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('novo submit limpa o erro anterior e o login bem-sucedido segue o fluxo normal', async () => {
    mockPost.mockRejectedValueOnce({
      response: { status: 401, data: { message: 'Credenciais inválidas.' } },
    });
    render(<LoginPage />);
    fillAndSubmit();
    expect(await screen.findByText('Credenciais inválidas.')).toBeInTheDocument();

    authOk();
    fillAndSubmit();
    await vi.waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith('/dashboard')
    );
    expect(localStorage.getItem('token')).toBe('tok');
    expect(screen.queryByText('Credenciais inválidas.')).not.toBeInTheDocument();
  });

  it('login bem-sucedido após aviso de suspensão segue fluxo normal (pós-reativação)', async () => {
    mockQuery = 'reason=suspended';
    authOk();
    render(<LoginPage />);
    expect(await screen.findByText(SUSP_MSG)).toBeInTheDocument();
    fillAndSubmit();
    await vi.waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith('/dashboard')
    );
    expect(localStorage.getItem('token')).toBe('tok');
  });
});
