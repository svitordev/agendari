import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const mockRouter = { replace: vi.fn(), push: vi.fn() };

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/admin/login',
}));

vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
  },
}));

import api from '@/lib/api';
import AdminLoginPage from '@/app/admin/(auth)/login/page';

const mockPost = vi.mocked(api.post);

function fillAndSubmit() {
  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: 'x@test.local' },
  });
  fireEvent.change(screen.getByLabelText('Senha'), {
    target: { value: 'senha' },
  });
  fireEvent.click(screen.getByRole('button', { name: /entrar/i }));
}

describe('/admin/login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('4. login ADMIN → /admin com sessão mantida', async () => {
    mockPost.mockResolvedValue({
      data: {
        accessToken: 'tok',
        user: { id: 'u1', email: 'x@test.local', firstName: 'Ada', lastName: 'Admin', role: 'ADMIN' },
      },
    });
    render(<AdminLoginPage />);
    fillAndSubmit();
    await vi.waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/admin'));
    expect(localStorage.getItem('token')).toBe('tok');
  });

  it('5. login PROFESSIONAL em /admin/login é recusado e sessão limpa', async () => {
    mockPost.mockResolvedValue({
      data: {
        accessToken: 'tok',
        user: { id: 'u2', email: 'x@test.local', firstName: 'Ana', lastName: 'Pro', role: 'PROFESSIONAL' },
      },
    });
    render(<AdminLoginPage />);
    fillAndSubmit();
    expect(
      await screen.findByText('Esta área é exclusiva para administradores.')
    ).toBeInTheDocument();
    expect(localStorage.getItem('token')).toBeNull();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('login inválido mostra erro normal', async () => {
    mockPost.mockRejectedValue({ response: { data: { message: 'Credenciais inválidas.' } } });
    render(<AdminLoginPage />);
    fillAndSubmit();
    expect(await screen.findByText('Credenciais inválidas.')).toBeInTheDocument();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
});
