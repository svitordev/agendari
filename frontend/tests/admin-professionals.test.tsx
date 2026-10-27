import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { ReactNode } from 'react';

const { mockToastSuccess, mockToastError, mockPush, mockReplace } = vi.hoisted(() => ({
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
  mockPush: vi.fn(),
  mockReplace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
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
    patch: vi.fn(),
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
  },
}));

vi.mock('sonner', () => ({
  toast: { success: mockToastSuccess, error: mockToastError },
}));

import api from '@/lib/api';
import AdminProfessionalsPage from '@/app/admin/(protected)/professionals/page';
import type { AdminProfessionalItem, ProfessionalStatus } from '@/types';

const mockGet = vi.mocked(api.get);
const mockPatch = vi.mocked(api.patch);

const itemComUser: AdminProfessionalItem = {
  id: 'p1',
  slug: 'ana',
  name: 'Ana Pro',
  avatarUrl: null,
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  user: { id: 'u1', email: 'ana@test.local', firstName: 'Ana', lastName: 'Pro', role: 'PROFESSIONAL' },
  _count: { services: 3, appointments: 10 },
};
const itemSemUser: AdminProfessionalItem = {
  id: 'p2',
  slug: 'sem-user',
  name: 'Sem User SA',
  avatarUrl: null,
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  user: null,
  _count: { services: 0, appointments: 0 },
};
const itemSuspenso: AdminProfessionalItem = {
  id: 'p3',
  slug: 'bia',
  name: 'Bia Sus',
  avatarUrl: null,
  status: 'SUSPENDED',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  user: { id: 'u3', email: 'bia@test.local', firstName: 'Bia', lastName: 'Sus', role: 'PROFESSIONAL' },
  _count: { services: 1, appointments: 2 },
};

// Shape real da resposta do PATCH /status — idêntica ao GET individual (AdminProfessionalDetails).
const details = (id: string, status: ProfessionalStatus) => ({
  data: {
    professional: {
      id,
      name: 'X',
      slug: 'x',
      status,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-10-25T00:00:00.000Z',
    },
    user: null,
  },
});

const pageData = (items: AdminProfessionalItem[]) => ({
  data: { items, total: items.length, limit: 20, offset: 0 },
});

const apiError = (status?: number) => ({
  response: status === undefined ? undefined : { status, data: { message: 'Erro.' } },
});

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

// ============================================
// STATUS OPERACIONAL — badge + Suspender/Reativar
// ============================================

describe('/admin/professionals — badge de status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('badge: ACTIVE → "Ativo", SUSPENDED → "Suspenso"; enum técnico nunca exibido', async () => {
    mockGet.mockResolvedValue(pageData([itemComUser, itemSuspenso]));
    render(<AdminProfessionalsPage />);
    expect(await screen.findByText('Ativo')).toBeInTheDocument();
    expect(screen.getByText('Suspenso')).toBeInTheDocument();
    expect(screen.queryByText('ACTIVE')).not.toBeInTheDocument();
    expect(screen.queryByText('SUSPENDED')).not.toBeInTheDocument();
  });
});

describe('/admin/professionals — ações por status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('ACTIVE mostra Suspender (nunca Reativar); SUSPENDED mostra Reativar (nunca Suspender); Editar nas duas', async () => {
    mockGet.mockResolvedValue(pageData([itemComUser, itemSuspenso]));
    render(<AdminProfessionalsPage />);
    await screen.findByText('Ativo');
    expect(screen.getAllByRole('button', { name: 'Suspender' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Reativar' })).toHaveLength(1);
    expect(screen.getAllByRole('link', { name: /editar/i })).toHaveLength(2);
  });

  it('user=null continua exibindo a ação de status (ação não some por ausência de User)', async () => {
    mockGet.mockResolvedValue(pageData([itemSemUser]));
    render(<AdminProfessionalsPage />);
    await screen.findByText('Sem User SA');
    expect(screen.getByRole('button', { name: 'Suspender' })).toBeEnabled();
  });

  it('listagem NÃO exibe ação de arquivamento (decisão: archive só na página de edição)', async () => {
    mockGet.mockResolvedValue(pageData([itemComUser, itemSemUser, itemSuspenso]));
    render(<AdminProfessionalsPage />);
    await screen.findByText('Ana Pro');
    expect(screen.queryByText(/arquivar/i)).not.toBeInTheDocument();
  });
});

describe('/admin/professionals — diálogo de suspensão', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('Suspender abre AlertDialog com título/descrição completos; Cancelar fecha com zero PATCH', async () => {
    mockGet.mockResolvedValue(pageData([itemComUser]));
    render(<AdminProfessionalsPage />);
    await screen.findByText('Ativo');
    fireEvent.click(screen.getByRole('button', { name: 'Suspender' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Suspender este profissional?')).toBeInTheDocument();
    const desc = within(dialog).getByText(/perderá o acesso às áreas privadas/);
    expect(desc.textContent).toMatch(/novos agendamentos serão bloqueados/);
    expect(desc.textContent).toMatch(/Dados e agendamentos existentes serão preservados/);
    expect(desc.textContent).toMatch(/reversível/);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    await vi.waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(mockPatch).not.toHaveBeenCalled();
    expect(mockToastSuccess).not.toHaveBeenCalled(); // cancelar não gera feedback de sucesso
  });
});

describe('/admin/professionals — PATCH suspender', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('confirmar → PATCH no endpoint correto, id real do item, payload exatamente {status:SUSPENDED}', async () => {
    mockGet.mockResolvedValue(pageData([itemComUser]));
    mockPatch.mockResolvedValue(details('p1', 'SUSPENDED'));
    render(<AdminProfessionalsPage />);
    await screen.findByText('Ativo');
    fireEvent.click(screen.getByRole('button', { name: 'Suspender' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Suspender' }));
    await vi.waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(1));
    expect(mockPatch).toHaveBeenCalledWith('/admin/professionals/p1/status', { status: 'SUSPENDED' });
    expect(Object.keys(mockPatch.mock.calls[0][1] as object)).toEqual(['status']);
  });

  it('pending: linha bloqueada com "Suspendendo...", Editar disabled, outra linha utilizável', async () => {
    mockGet.mockResolvedValue(pageData([itemComUser, itemSuspenso]));
    let resolvePatch: (v: unknown) => void = () => {};
    mockPatch.mockReturnValue(new Promise((r) => { resolvePatch = r; }));
    render(<AdminProfessionalsPage />);
    await screen.findByText('Ativo');
    fireEvent.click(screen.getByRole('button', { name: 'Suspender' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Suspender' }));
    await vi.waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Suspendendo...' })).toBeDisabled();
    // Editar da linha pending vira botão disabled — realmente inoperante (sem navegação)
    const editarDisabled = screen.getByRole('button', { name: /editar/i });
    expect(editarDisabled).toBeDisabled();
    fireEvent.click(editarDisabled);
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    // outra linha continua utilizável
    fireEvent.click(screen.getByRole('button', { name: 'Reativar' }));
    await vi.waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(2));
    resolvePatch(details('p3', 'ACTIVE'));
  });

  it('duplo clique com Promise pendente → exatamente 1 PATCH', async () => {
    mockGet.mockResolvedValue(pageData([itemSuspenso]));
    let resolvePatch: (v: unknown) => void = () => {};
    mockPatch.mockReturnValue(new Promise((r) => { resolvePatch = r; }));
    render(<AdminProfessionalsPage />);
    await screen.findByText('Suspenso');
    fireEvent.click(screen.getByRole('button', { name: 'Reativar' }));
    await vi.waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Reativando...' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reativando...' }));
    await new Promise((r) => setTimeout(r, 20));
    expect(mockPatch).toHaveBeenCalledTimes(1);
    resolvePatch(details('p3', 'ACTIVE'));
  });
});

describe('/admin/professionals — sucesso', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('200 suspender → toast, badge Suspenso, ação vira Reativar, sem GET extra, sem redirect', async () => {
    mockGet.mockResolvedValue(pageData([itemComUser]));
    mockPatch.mockResolvedValue(details('p1', 'SUSPENDED'));
    render(<AdminProfessionalsPage />);
    await screen.findByText('Ativo');
    fireEvent.click(screen.getByRole('button', { name: 'Suspender' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Suspender' }));
    await vi.waitFor(() =>
      expect(mockToastSuccess).toHaveBeenCalledWith('Profissional suspenso com sucesso.'),
    );
    expect(screen.getByText('Suspenso')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reativar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Suspender' })).not.toBeInTheDocument();
    expect(mockGet).toHaveBeenCalledTimes(1); // update local — sem GET extra
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('200 reativar → direta sem diálogo, payload exato, toast, badge Ativo, ação vira Suspender, sem redirect', async () => {
    mockGet.mockResolvedValue(pageData([itemSuspenso]));
    mockPatch.mockResolvedValue(details('p3', 'ACTIVE'));
    render(<AdminProfessionalsPage />);
    await screen.findByText('Suspenso');
    fireEvent.click(screen.getByRole('button', { name: 'Reativar' }));
    await vi.waitFor(() =>
      expect(mockPatch).toHaveBeenCalledWith('/admin/professionals/p3/status', { status: 'ACTIVE' }),
    );
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(); // reativação é direta
    await vi.waitFor(() =>
      expect(mockToastSuccess).toHaveBeenCalledWith('Profissional reativado com sucesso.'),
    );
    await vi.waitFor(() => expect(screen.getByText('Ativo')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Suspender' })).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('autoridade do backend: request SUSPENDED, response ACTIVE → badge permanece Ativo', async () => {
    // Response divergente do pedido — a UI deve refletir a resposta, não o request.
    mockGet.mockResolvedValue(pageData([itemComUser]));
    mockPatch.mockResolvedValue(details('p1', 'ACTIVE'));
    render(<AdminProfessionalsPage />);
    await screen.findByText('Ativo');
    fireEvent.click(screen.getByRole('button', { name: 'Suspender' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Suspender' }));
    await vi.waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(mockToastSuccess).toHaveBeenCalled());
    expect(screen.getByText('Ativo')).toBeInTheDocument(); // resposta prevalece sobre o pedido
    expect(screen.queryByText('Suspenso')).not.toBeInTheDocument();
  });

  it('sem optimistic: badge só muda após a resposta — antes disso permanece Ativo', async () => {
    mockGet.mockResolvedValue(pageData([itemComUser]));
    let resolvePatch: (v: unknown) => void = () => {};
    mockPatch.mockReturnValue(new Promise((r) => { resolvePatch = r; }));
    render(<AdminProfessionalsPage />);
    await screen.findByText('Ativo');
    fireEvent.click(screen.getByRole('button', { name: 'Suspender' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Suspender' }));
    await vi.waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(1));
    // PATCH pendente — badge ainda no estado original (sem optimistic update)
    expect(screen.getByText('Ativo')).toBeInTheDocument();
    expect(screen.queryByText('Suspenso')).not.toBeInTheDocument();
    resolvePatch(details('p1', 'SUSPENDED'));
    await vi.waitFor(() => expect(screen.getByText('Suspenso')).toBeInTheDocument());
  });
});

describe('/admin/professionals — erros', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('400 → erro seguro, badge inalterado, pending liberado', async () => {
    mockGet.mockResolvedValue(pageData([itemSuspenso]));
    mockPatch.mockRejectedValue(apiError(400));
    render(<AdminProfessionalsPage />);
    await screen.findByText('Suspenso');
    fireEvent.click(screen.getByRole('button', { name: 'Reativar' }));
    await vi.waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith(
        'Não foi possível alterar o status do profissional.',
      ),
    );
    expect(screen.getByText('Suspenso')).toBeInTheDocument(); // badge inalterado
    expect(screen.getByRole('button', { name: 'Reativar' })).toBeEnabled(); // pending liberado
  });

  it('404 → mensagem segura + refetch preservando busca e página (offset não inicial)', async () => {
    mockGet.mockResolvedValue({ data: { items: [itemSuspenso], total: 50, limit: 20, offset: 0 } });
    mockPatch.mockRejectedValue(apiError(404));
    render(<AdminProfessionalsPage />);
    await screen.findByText('Bia Sus');
    fireEvent.change(screen.getByLabelText('Buscar profissionais'), { target: { value: 'Bia' } });
    await vi.waitFor(() =>
      expect(mockGet).toHaveBeenLastCalledWith('/admin/professionals', {
        params: { limit: 20, offset: 0, search: 'Bia' },
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: /próxima/i })); // página não inicial
    await screen.findByText('Bia Sus'); // aguarda o re-render da nova página
    await vi.waitFor(() =>
      expect(mockGet).toHaveBeenLastCalledWith('/admin/professionals', {
        params: { limit: 20, offset: 20, search: 'Bia' },
      }),
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Reativar' }));
    await vi.waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Profissional não encontrado.'));
    // refetch com os mesmos parâmetros — busca E página preservadas
    expect(mockGet).toHaveBeenLastCalledWith('/admin/professionals', {
      params: { limit: 20, offset: 20, search: 'Bia' },
    });
  });

  it('403 → acesso negado sem logout manual (token preservado, badge inalterado)', async () => {
    localStorage.setItem('token', 't');
    mockGet.mockResolvedValue(pageData([itemSuspenso]));
    mockPatch.mockRejectedValue(apiError(403));
    render(<AdminProfessionalsPage />);
    await screen.findByText('Suspenso');
    fireEvent.click(screen.getByRole('button', { name: 'Reativar' }));
    await vi.waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith('Acesso negado para esta área.'),
    );
    expect(localStorage.getItem('token')).toBe('t');
    expect(screen.getByText('Suspenso')).toBeInTheDocument();
  });

  it('5xx → badge inalterado, toast genérico, pending liberado, retry funciona', async () => {
    mockGet.mockResolvedValue(pageData([itemSuspenso]));
    mockPatch.mockRejectedValueOnce(apiError(500));
    mockPatch.mockResolvedValueOnce(details('p3', 'ACTIVE'));
    render(<AdminProfessionalsPage />);
    await screen.findByText('Suspenso');
    fireEvent.click(screen.getByRole('button', { name: 'Reativar' }));
    await vi.waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith(
        'Não foi possível alterar o status do profissional. Tente novamente.',
      ),
    );
    expect(screen.getByText('Suspenso')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reativar' })); // retry
    await vi.waitFor(() =>
      expect(mockToastSuccess).toHaveBeenCalledWith('Profissional reativado com sucesso.'),
    );
    expect(screen.getByText('Ativo')).toBeInTheDocument();
  });

  it('erro de rede (sem response) → badge inalterado + toast genérico', async () => {
    mockGet.mockResolvedValue(pageData([itemSuspenso]));
    mockPatch.mockRejectedValue(new Error('Network Error'));
    render(<AdminProfessionalsPage />);
    await screen.findByText('Suspenso');
    fireEvent.click(screen.getByRole('button', { name: 'Reativar' }));
    await vi.waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith(
        'Não foi possível alterar o status do profissional. Tente novamente.',
      ),
    );
    expect(screen.getByText('Suspenso')).toBeInTheDocument();
  });
});

describe('/admin/professionals — raça', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('resposta PATCH após item sair da lista não reinsere o item', async () => {
    mockGet.mockResolvedValue(pageData([itemSuspenso]));
    let resolvePatch: (v: unknown) => void = () => {};
    mockPatch.mockReturnValue(new Promise((r) => { resolvePatch = r; }));
    render(<AdminProfessionalsPage />);
    await screen.findByText('Bia Sus');
    fireEvent.click(screen.getByRole('button', { name: 'Reativar' }));
    await vi.waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(1));
    // busca muda enquanto o PATCH está pendente — item sai da lista
    mockGet.mockResolvedValue(pageData([itemComUser]));
    fireEvent.change(screen.getByLabelText('Buscar profissionais'), { target: { value: 'Ana' } });
    await screen.findByText('Ana Pro');
    resolvePatch(details('p3', 'ACTIVE'));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText('Bia Sus')).not.toBeInTheDocument(); // não reinserido
    expect(screen.getByText('Ana Pro')).toBeInTheDocument();
  });

  it('resposta PATCH de A não altera B', async () => {
    const itemBSus: AdminProfessionalItem = { ...itemSuspenso, id: 'p4', name: 'Carla Sus', slug: 'carla' };
    mockGet.mockResolvedValue(pageData([itemSuspenso, itemBSus]));
    mockPatch.mockResolvedValue(details('p3', 'ACTIVE'));
    render(<AdminProfessionalsPage />);
    await screen.findByText('Bia Sus');
    fireEvent.click(screen.getAllByRole('button', { name: 'Reativar' })[0]); // linha A
    await vi.waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => {
      expect(screen.getByText('Ativo')).toBeInTheDocument(); // A atualizado
      expect(screen.getAllByText('Suspenso')).toHaveLength(1); // B inalterado
    });
  });

  it('pending de A não bloqueia B — quando A termina, B continua pending', async () => {
    const itemBSus: AdminProfessionalItem = { ...itemSuspenso, id: 'p4', name: 'Carla Sus', slug: 'carla' };
    mockGet.mockResolvedValue(pageData([itemSuspenso, itemBSus]));
    let resolveA: (v: unknown) => void = () => {};
    let resolveB: (v: unknown) => void = () => {};
    mockPatch.mockReturnValueOnce(new Promise((r) => { resolveA = r; }));
    mockPatch.mockReturnValueOnce(new Promise((r) => { resolveB = r; }));
    render(<AdminProfessionalsPage />);
    await screen.findByText('Bia Sus');
    fireEvent.click(screen.getAllByRole('button', { name: 'Reativar' })[0]); // linha A (p3)
    await vi.waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(1));
    // linha B ainda acionável com A pendente
    fireEvent.click(screen.getByRole('button', { name: 'Reativar' })); // única restante = B (p4)
    await vi.waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(2));
    expect(mockPatch.mock.calls[0][0]).toBe('/admin/professionals/p3/status');
    expect(mockPatch.mock.calls[1][0]).toBe('/admin/professionals/p4/status');
    resolveA(details('p3', 'ACTIVE')); // A termina; B segue pendente
    await vi.waitFor(() => {
      expect(screen.getByText('Ativo')).toBeInTheDocument(); // A atualizado
      expect(screen.getAllByText('Suspenso')).toHaveLength(1); // B ainda Suspenso (pending)
    });
    // B continua com loading textual e disabled — pending por ID de verdade
    expect(screen.getByRole('button', { name: 'Reativando...' })).toBeDisabled();
    resolveB(details('p4', 'ACTIVE'));
    await vi.waitFor(() => expect(screen.getAllByText('Ativo')).toHaveLength(2));
  });
});

describe('/admin/professionals — regressão', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('link Novo profissional continua', async () => {
    mockGet.mockResolvedValue(pageData([itemComUser]));
    render(<AdminProfessionalsPage />);
    await screen.findByText('Ativo');
    expect(screen.getByRole('link', { name: /novo profissional/i })).toHaveAttribute(
      'href',
      '/admin/professionals/new',
    );
  });

  it('loading original (skeletons) continua', async () => {
    mockGet.mockReturnValue(new Promise<never>(() => {}));
    const { container } = render(<AdminProfessionalsPage />);
    await vi.waitFor(() =>
      expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0),
    );
  });

  it('denied original continua (403 da listagem não é logout)', async () => {
    localStorage.setItem('token', 't');
    mockGet.mockRejectedValue({ response: { status: 403 } });
    render(<AdminProfessionalsPage />);
    expect(await screen.findByText('Acesso negado para esta área.')).toBeInTheDocument();
    expect(localStorage.getItem('token')).toBe('t');
  });
});
