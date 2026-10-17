import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const mockRouter = { replace: vi.fn(), push: vi.fn() };

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/admin',
}));

vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
  },
}));

import api from '@/lib/api';
import AdminRoute from '@/components/admin/AdminRoute';

const mockGet = vi.mocked(api.get);

const adminUser = {
  id: 'u1',
  email: 'admin@test.local',
  firstName: 'Ada',
  lastName: 'Admin',
  role: 'ADMIN' as const,
};
const proUser = {
  id: 'u2',
  email: 'pro@test.local',
  firstName: 'Ana',
  lastName: 'Pro',
  role: 'PROFESSIONAL' as const,
};

describe('AdminRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('1. ADMIN renderiza children', async () => {
    localStorage.setItem('token', 't');
    mockGet.mockResolvedValue({ data: adminUser });
    render(<AdminRoute><p>CONTEUDO_PROTEGIDO</p></AdminRoute>);
    expect(await screen.findByText('CONTEUDO_PROTEGIDO')).toBeInTheDocument();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('2. sem sessão → /admin/login', async () => {
    render(<AdminRoute><p>CONTEUDO_PROTEGIDO</p></AdminRoute>);
    await vi.waitFor(() =>
      expect(mockRouter.replace).toHaveBeenCalledWith('/admin/login')
    );
    expect(screen.queryByText('CONTEUDO_PROTEGIDO')).not.toBeInTheDocument();
  });

  it('3. PROFESSIONAL → /login', async () => {
    localStorage.setItem('token', 't');
    mockGet.mockResolvedValue({ data: proUser });
    render(<AdminRoute><p>CONTEUDO_PROTEGIDO</p></AdminRoute>);
    await vi.waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/login'));
    expect(screen.queryByText('CONTEUDO_PROTEGIDO')).not.toBeInTheDocument();
  });
});
