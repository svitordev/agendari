import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/admin/professionals',
}));

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children?: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
  },
}));

import api from '@/lib/api';
import AdminProfessionalsPage from '@/app/admin/(protected)/professionals/page';

const mockGet = vi.mocked(api.get);

const itemComUser = {
  id: 'p1',
  slug: 'ana',
  name: 'Ana Pro',
  avatarUrl: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  user: { id: 'u1', email: 'ana@test.local', firstName: 'Ana', lastName: 'Pro', role: 'PROFESSIONAL' },
  _count: { services: 3, appointments: 10 },
};
const itemSemUser = {
  id: 'p2',
  slug: 'sem-user',
  name: 'Sem User SA',
  avatarUrl: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  user: null,
  _count: { services: 0, appointments: 0 },
};

describe('/admin/professionals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('6. renderiza resposta da listagem', async () => {
    mockGet.mockResolvedValue({
      data: { items: [itemComUser, itemSemUser], total: 2, limit: 20, offset: 0 },
    });
    render(<AdminProfessionalsPage />);
    expect(await screen.findByText('Ana Pro')).toBeInTheDocument();
    expect(screen.getByText('ana')).toBeInTheDocument();
    expect(screen.getByText('ana@test.local')).toBeInTheDocument();
  });

  it('7. user=null não quebra a tabela', async () => {
    mockGet.mockResolvedValue({
      data: { items: [itemComUser, itemSemUser], total: 2, limit: 20, offset: 0 },
    });
    render(<AdminProfessionalsPage />);
    expect(await screen.findByText('Sem User SA')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('8. search após debounce altera a query', async () => {
    mockGet.mockResolvedValue({
      data: { items: [itemComUser], total: 1, limit: 20, offset: 0 },
    });
    render(<AdminProfessionalsPage />);
    await screen.findByText('Ana Pro');
    mockGet.mockClear();
    fireEvent.change(screen.getByLabelText('Buscar profissionais'), {
      target: { value: 'Ana' },
    });
    await vi.waitFor(() =>
      expect(mockGet).toHaveBeenCalledWith('/admin/professionals', {
        params: { limit: 20, offset: 0, search: 'Ana' },
      })
    );
  });

  it('9. mudar search reseta o offset', async () => {
    mockGet.mockResolvedValue({
      data: { items: [itemComUser], total: 50, limit: 20, offset: 20 },
    });
    render(<AdminProfessionalsPage />);
    await screen.findByText('Ana Pro');
    fireEvent.click(screen.getByRole('button', { name: /próxima/i }));
    await vi.waitFor(() =>
      expect(mockGet).toHaveBeenLastCalledWith('/admin/professionals', {
        params: { limit: 20, offset: 20 },
      })
    );
    fireEvent.change(screen.getByLabelText('Buscar profissionais'), {
      target: { value: 'Ana' },
    });
    await vi.waitFor(() =>
      expect(mockGet).toHaveBeenLastCalledWith('/admin/professionals', {
        params: { limit: 20, offset: 0, search: 'Ana' },
      })
    );
  });

  it('10. Próxima altera o offset', async () => {
    mockGet.mockResolvedValue({
      data: { items: [itemComUser], total: 50, limit: 20, offset: 0 },
    });
    render(<AdminProfessionalsPage />);
    await screen.findByText('Ana Pro');
    fireEvent.click(screen.getByRole('button', { name: /próxima/i }));
    await vi.waitFor(() =>
      expect(mockGet).toHaveBeenLastCalledWith('/admin/professionals', {
        params: { limit: 20, offset: 20 },
      })
    );
  });

  it('11. Anterior altera o offset', async () => {
    mockGet.mockResolvedValue({
      data: { items: [itemComUser], total: 50, limit: 20, offset: 20 },
    });
    render(<AdminProfessionalsPage />);
    await screen.findByText('Ana Pro');
    fireEvent.click(screen.getByRole('button', { name: /anterior/i }));
    await vi.waitFor(() =>
      expect(mockGet).toHaveBeenLastCalledWith('/admin/professionals', {
        params: { limit: 20, offset: 0 },
      })
    );
  });

  it('14. 403 da listagem não é tratado como 401/logout', async () => {
    localStorage.setItem('token', 't');
    mockGet.mockRejectedValue({ response: { status: 403 } });
    render(<AdminProfessionalsPage />);
    expect(await screen.findByText('Acesso negado para esta área.')).toBeInTheDocument();
    expect(localStorage.getItem('token')).toBe('t');
  });

  it('17. resposta obsoleta não sobrescreve resposta mais nova', async () => {
    // Request A (montagem, sem search) e B (após debounce). B resolve antes;
    // A chega depois e precisa ser descartado.
    let resolveA: (v: unknown) => void = () => {};
    let resolveB: (v: unknown) => void = () => {};
    const promiseA = new Promise((r) => { resolveA = r; });
    const promiseB = new Promise((r) => { resolveB = r; });
    let calls = 0;
    mockGet.mockImplementation(() => (++calls === 1 ? promiseA : promiseB));

    render(<AdminProfessionalsPage />);
    await vi.waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText('Buscar profissionais'), {
      target: { value: 'Ana' },
    });
    await vi.waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));

    resolveB({ data: { items: [itemComUser], total: 1, limit: 20, offset: 0 } });
    await vi.waitFor(() => expect(screen.getByText('Ana Pro')).toBeInTheDocument());

    resolveA({ data: { items: [itemSemUser], total: 1, limit: 20, offset: 0 } });
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByText('Ana Pro')).toBeInTheDocument(); // nova permanece
    expect(screen.queryByText('Sem User SA')).not.toBeInTheDocument(); // obsoleta descartada
  });

  it('18. link Editar existe e usa o id da linha na rota de edição', async () => {
    mockGet.mockResolvedValue({
      data: { items: [itemComUser], total: 1, limit: 20, offset: 0 },
    });
    render(<AdminProfessionalsPage />);
    await screen.findByText('Ana Pro');
    expect(screen.getByRole('link', { name: /editar/i })).toHaveAttribute(
      'href',
      '/admin/professionals/p1/edit',
    );
  });

  it('19. cada linha tem seu próprio link Editar (inclusive user=null)', async () => {
    mockGet.mockResolvedValue({
      data: { items: [itemComUser, itemSemUser], total: 2, limit: 20, offset: 0 },
    });
    render(<AdminProfessionalsPage />);
    await screen.findByText('Ana Pro');
    const hrefs = screen
      .getAllByRole('link', { name: /editar/i })
      .map((l) => l.getAttribute('href'));
    expect(hrefs).toEqual(['/admin/professionals/p1/edit', '/admin/professionals/p2/edit']);
  });
});
