import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
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
import AdminProtectedLayout from '@/app/admin/(protected)/layout';

const mockGet = vi.mocked(api.get);

const adminUser = {
  id: 'u1',
  email: 'admin@test.local',
  firstName: 'Ada',
  lastName: 'Admin',
  role: 'ADMIN' as const,
};

describe('logout ADMIN', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { href: '', pathname: '/admin' },
    });
  });

  it('15. logout limpa sessão e vai para /admin/login', async () => {
    localStorage.setItem('token', 't');
    mockGet.mockResolvedValue({ data: adminUser });
    render(
      <AdminProtectedLayout>
        <p>PAINEL</p>
      </AdminProtectedLayout>
    );
    await screen.findByText('PAINEL');
    fireEvent.click(screen.getByRole('button', { name: /sair/i }));
    expect(localStorage.getItem('token')).toBeNull();
    expect(window.location.href).toBe('/admin/login');
  });
});
