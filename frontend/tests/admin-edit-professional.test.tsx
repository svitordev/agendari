import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { ReactNode } from 'react';

const { mockPush, mockReplace, mockGet, mockPatch, mockDelete, mockToastSuccess, mockToastError } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockReplace: vi.fn(),
  mockGet: vi.fn(),
  mockPatch: vi.fn(),
  mockDelete: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  usePathname: () => '/admin/professionals/p1/edit',
}));

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children?: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@/lib/api', () => ({
  default: {
    get: mockGet,
    post: vi.fn(),
    patch: mockPatch,
    delete: mockDelete,
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
  },
}));

vi.mock('sonner', () => ({
  toast: { success: mockToastSuccess, error: mockToastError },
}));

import AdminEditProfessionalPage from '@/app/admin/(protected)/professionals/[id]/edit/page';

// Padrão Next 16 do projeto: params é Promise resolvido pela página (Client Component).
const PARAMS = Promise.resolve({ id: 'p1' });

const details = {
  professional: {
    id: 'p1',
    name: 'Ana Pro',
    slug: 'ana-pro',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
  },
  user: {
    id: 'u1',
    email: 'ana@test.local',
    firstName: 'Ana',
    lastName: 'Pro',
    role: 'PROFESSIONAL',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
  },
};

// Erro fiel ao shape consumido pelo código: err.response.status / err.response.data.message.
function apiError(status: number, message?: string | string[]) {
  return { response: { status, data: message === undefined ? {} : { message } } };
}

async function loaded() {
  mockGet.mockResolvedValue({ data: details });
  render(<AdminEditProfessionalPage params={PARAMS} />);
  await screen.findByLabelText('Slug');
}

function submitButton() {
  return screen.getByRole('button', { name: /salvar/i });
}

function submit() {
  fireEvent.click(submitButton());
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('/admin/professionals/[id]/edit — carregamento', () => {
  it('1. loading inicial mostra skeleton, nunca formulário vazio', () => {
    mockGet.mockReturnValue(new Promise(() => {})); // nunca resolve
    const { container } = render(<AdminEditProfessionalPage params={PARAMS} />);
    expect(container.querySelector('.animate-pulse')).not.toBeNull();
    expect(screen.queryByLabelText('Slug')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('E-mail')).not.toBeInTheDocument();
  });

  it('2. GET é chamado com o id da rota', async () => {
    await loaded();
    expect(mockGet).toHaveBeenCalledWith('/admin/professionals/p1');
  });

  it('3. formulário é preenchido com os dados reais do GET', async () => {
    await loaded();
    expect(screen.getByLabelText('Nome profissional')).toHaveValue('Ana Pro');
    expect(screen.getByLabelText('Slug')).toHaveValue('ana-pro');
    expect(screen.getByLabelText('E-mail')).toHaveValue('ana@test.local');
    expect(screen.getByLabelText('Primeiro nome')).toHaveValue('Ana');
    expect(screen.getByLabelText('Sobrenome')).toHaveValue('Pro');
  });

  it('4. mudar o nome NÃO altera o slug (sem sugestão automática na edição)', async () => {
    await loaded();
    fireEvent.change(screen.getByLabelText('Nome profissional'), {
      target: { value: 'Novo Nome' },
    });
    expect(screen.getByLabelText('Slug')).toHaveValue('ana-pro');
  });

  it('5. avisos de slug e email estão visíveis', async () => {
    await loaded();
    expect(
      screen.getByText('Alterar o slug muda a URL pública do profissional.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Alterar o e-mail muda a credencial usada pelo profissional para entrar.',
      ),
    ).toBeInTheDocument();
  });
});

describe('/admin/professionals/[id]/edit — user=null', () => {
  it('6. user=null mostra aviso e desabilita o Salvar', async () => {
    mockGet.mockResolvedValue({ data: { professional: details.professional, user: null } });
    render(<AdminEditProfessionalPage params={PARAMS} />);
    expect(
      await screen.findByText('Este profissional não possui usuário associado.'),
    ).toBeInTheDocument();
    expect(submitButton()).toBeDisabled();
  });

  it('7. user=null impede submit e não cria valores fictícios', async () => {
    mockGet.mockResolvedValue({ data: { professional: details.professional, user: null } });
    render(<AdminEditProfessionalPage params={PARAMS} />);
    await screen.findByText('Este profissional não possui usuário associado.');
    // name/slug somente como referência (dados reais); campos do User sem valores inventados.
    expect(screen.getByLabelText('Nome profissional')).toHaveValue('Ana Pro');
    expect(screen.getByLabelText('Slug')).toHaveValue('ana-pro');
    expect(screen.getByLabelText('E-mail')).toHaveValue('');
    expect(screen.getByLabelText('Primeiro nome')).toHaveValue('');
    expect(screen.getByLabelText('Sobrenome')).toHaveValue('');
    fireEvent.click(submitButton());
    await new Promise((r) => setTimeout(r, 0));
    expect(mockPatch).not.toHaveBeenCalled();
  });
});

describe('/admin/professionals/[id]/edit — erros do GET', () => {
  it('8. GET 404 mostra estado dedicado sem formulário', async () => {
    mockGet.mockRejectedValue(apiError(404, 'Profissional não encontrado.'));
    render(<AdminEditProfessionalPage params={PARAMS} />);
    expect(await screen.findByText('Profissional não encontrado.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Slug')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /voltar para profissionais/i })).toHaveAttribute(
      'href',
      '/admin/professionals',
    );
  });

  it('9. GET 403 mostra acesso negado sem logout', async () => {
    localStorage.setItem('token', 't');
    mockGet.mockRejectedValue(apiError(403));
    render(<AdminEditProfessionalPage params={PARAMS} />);
    expect(await screen.findByText('Acesso negado para esta área.')).toBeInTheDocument();
    expect(localStorage.getItem('token')).toBe('t');
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('10. GET 5xx/rede mostra erro genérico e retry faz novo GET', async () => {
    mockGet.mockRejectedValueOnce(apiError(500));
    render(<AdminEditProfessionalPage params={PARAMS} />);
    expect(
      await screen.findByText('Não foi possível carregar o profissional.'),
    ).toBeInTheDocument();
    mockGet.mockResolvedValue({ data: details });
    fireEvent.click(screen.getByRole('button', { name: /tentar novamente/i }));
    await vi.waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(screen.getByLabelText('Slug')).toHaveValue('ana-pro'));
  });
});

describe('/admin/professionals/[id]/edit — validações (UX)', () => {
  it('11. campos obrigatórios impedem o submit', async () => {
    await loaded();
    for (const label of [
      'Nome profissional',
      'Slug',
      'E-mail',
      'Primeiro nome',
      'Sobrenome',
    ]) {
      fireEvent.change(screen.getByLabelText(label), { target: { value: '' } });
    }
    submit();
    await vi.waitFor(() =>
      expect(screen.getByText('Informe o nome profissional.')).toBeInTheDocument(),
    );
    expect(screen.getByText('Informe o slug.')).toBeInTheDocument();
    expect(screen.getByText('Informe o e-mail.')).toBeInTheDocument();
    expect(screen.getByText('Informe o primeiro nome.')).toBeInTheDocument();
    expect(screen.getByText('Informe o sobrenome.')).toBeInTheDocument();
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it('12. email inválido mostra validação', async () => {
    await loaded();
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'email-invalido' } });
    submit();
    await vi.waitFor(() => expect(screen.getByText('E-mail inválido.')).toBeInTheDocument());
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it('13. slug inválido mostra validação', async () => {
    await loaded();
    fireEvent.change(screen.getByLabelText('Slug'), { target: { value: 'SMOKE INVALID' } });
    submit();
    await vi.waitFor(() =>
      expect(screen.getByText('Use apenas letras minúsculas, números e hífens.')).toBeInTheDocument(),
    );
    expect(mockPatch).not.toHaveBeenCalled();
  });
});

describe('/admin/professionals/[id]/edit — PATCH', () => {
  it('14. payload contém exatamente os 5 campos (sem password/role/ids)', async () => {
    await loaded();
    mockPatch.mockResolvedValue({ data: details });
    submit();
    await vi.waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(1));
    expect(mockPatch).toHaveBeenCalledWith('/admin/professionals/p1', {
      name: 'Ana Pro',
      slug: 'ana-pro',
      email: 'ana@test.local',
      firstName: 'Ana',
      lastName: 'Pro',
    });
    // Mass assignment impossível: exatamente as 5 chaves, nada além.
    const payload = mockPatch.mock.calls[0][1] as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual([
      'email',
      'firstName',
      'lastName',
      'name',
      'slug',
    ]);
    for (const banned of [
      'password',
      'role',
      'professionalId',
      'userId',
      'id',
      'createdAt',
      'updatedAt',
    ]) {
      expect(payload).not.toHaveProperty(banned);
    }
  });

  it('15. duplo submit com Promise pendente gera exatamente 1 PATCH', async () => {
    await loaded();
    let resolvePatch: (v: unknown) => void = () => {};
    mockPatch.mockReturnValue(new Promise((r) => { resolvePatch = r; }));
    submit();
    await vi.waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(1));
    // Durante o submit o botão fica desabilitado com "Salvando...".
    const btn = screen.getByRole('button', { name: /salvando/i });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    await new Promise((r) => setTimeout(r, 0));
    expect(mockPatch).toHaveBeenCalledTimes(1);
    resolvePatch({ data: details });
  });

  it('16. sucesso 200 → toast + redirect para a listagem', async () => {
    await loaded();
    mockPatch.mockResolvedValue({ data: details });
    submit();
    await vi.waitFor(() =>
      expect(mockToastSuccess).toHaveBeenCalledWith('Profissional atualizado com sucesso.'),
    );
    expect(mockPush).toHaveBeenCalledWith('/admin/professionals');
  });

  it('17. erro não redireciona e não mostra toast de sucesso', async () => {
    await loaded();
    mockPatch.mockRejectedValue(apiError(500));
    submit();
    await vi.waitFor(() =>
      expect(
        screen.getByText('Não foi possível atualizar o profissional. Tente novamente.'),
      ).toBeInTheDocument(),
    );
    expect(mockToastSuccess).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('18. PATCH 400 com message array mostra erro geral legível', async () => {
    await loaded();
    mockPatch.mockRejectedValue(
      apiError(400, ['name should not be empty.', 'email must be an email.']),
    );
    submit();
    await vi.waitFor(() =>
      expect(
        screen.getByText('name should not be empty. email must be an email.'),
      ).toBeInTheDocument(),
    );
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('19. PATCH 404 permanece na tela com valor editado preservado e sem toast', async () => {
    await loaded();
    // Edição local antes do submit — não pode ser perdida pelo erro.
    fireEvent.change(screen.getByLabelText('Slug'), { target: { value: 'ana-editada' } });
    mockPatch.mockRejectedValue(apiError(404, 'Profissional não encontrado.'));
    submit();
    await vi.waitFor(() =>
      expect(screen.getByText('Profissional não encontrado.')).toBeInTheDocument(),
    );
    expect(screen.getByLabelText('Slug')).toHaveValue('ana-editada'); // valor editado permanece
    expect(mockToastSuccess).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('20. PATCH 409 email mostra erro junto ao campo email', async () => {
    await loaded();
    mockPatch.mockRejectedValue(apiError(409, 'E-mail já cadastrado.'));
    submit();
    await vi.waitFor(() => expect(screen.getByText('E-mail já cadastrado.')).toBeInTheDocument());
    expect(screen.getByLabelText('E-mail')).toHaveAttribute('aria-invalid', 'true');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('21. PATCH 409 slug mostra erro junto ao campo slug', async () => {
    await loaded();
    mockPatch.mockRejectedValue(apiError(409, 'Slug já cadastrado.'));
    submit();
    await vi.waitFor(() => expect(screen.getByText('Slug já cadastrado.')).toBeInTheDocument());
    expect(screen.getByLabelText('Slug')).toHaveAttribute('aria-invalid', 'true');
  });

  it('22. PATCH 409 user ausente mostra erro geral específico', async () => {
    await loaded();
    mockPatch.mockRejectedValue(apiError(409, 'Este profissional não possui usuário associado.'));
    submit();
    await vi.waitFor(() =>
      expect(screen.getByText('Este profissional não possui usuário associado.')).toBeInTheDocument(),
    );
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('23. PATCH 409 residual mostra a mensagem sem reinterpretar causa', async () => {
    await loaded();
    mockPatch.mockRejectedValue(
      apiError(409, 'O cadastro foi alterado durante a operação. Recarregue e tente novamente.'),
    );
    submit();
    await vi.waitFor(() =>
      expect(
        screen.getByText(
          'O cadastro foi alterado durante a operação. Recarregue e tente novamente.',
        ),
      ).toBeInTheDocument(),
    );
  });

  it('24. PATCH 409 desconhecido usa fallback seguro sem adivinhar campo', async () => {
    await loaded();
    mockPatch.mockRejectedValue(apiError(409, 'Já existe um cadastro com esses dados.'));
    submit();
    await vi.waitFor(() =>
      expect(
        screen.getByText('Não foi possível atualizar o profissional devido a um conflito.'),
      ).toBeInTheDocument(),
    );
  });

  it('25. PATCH 403 mostra acesso negado sem logout manual e preserva formulário', async () => {
    localStorage.setItem('token', 't');
    await loaded();
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'novo@test.local' } });
    mockPatch.mockRejectedValue(apiError(403));
    submit();
    await vi.waitFor(() => expect(screen.getByText('Acesso negado para esta área.')).toBeInTheDocument());
    expect(localStorage.getItem('token')).toBe('t');
    expect(screen.getByLabelText('E-mail')).toHaveValue('novo@test.local'); // valor editado permanece
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('26. PATCH 5xx mostra erro genérico, formulário permanece e retry funciona', async () => {
    await loaded();
    mockPatch.mockRejectedValueOnce(apiError(500));
    submit();
    await vi.waitFor(() =>
      expect(
        screen.getByText('Não foi possível atualizar o profissional. Tente novamente.'),
      ).toBeInTheDocument(),
    );
    mockPatch.mockResolvedValue({ data: details });
    submit();
    await vi.waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(2));
    await vi.waitFor(() =>
      expect(mockToastSuccess).toHaveBeenCalledWith('Profissional atualizado com sucesso.'),
    );
    expect(mockPush).toHaveBeenCalledWith('/admin/professionals');
  });
});

describe('/admin/professionals/[id]/edit — race (seqRef)', () => {
  it('27. resposta obsoleta não sobrescreve resposta mais nova', async () => {
    // Request A (params A) fica pendente; B (params B, rerender) resolve primeiro;
    // A chega depois e precisa ser descartada — formulário mantém B.
    let resolveGetA: (v: unknown) => void = () => {};
    const promiseGetA = new Promise((r) => { resolveGetA = r; });
    const dataA = {
      professional: { ...details.professional, id: 'pA', name: 'Obsoleta', slug: 'obsoleta' },
      user: details.user,
    };
    const dataB = {
      professional: { ...details.professional, id: 'pB', name: 'Nova', slug: 'nova' },
      user: details.user,
    };
    let calls = 0;
    mockGet.mockImplementation(() => (++calls === 1 ? promiseGetA : Promise.resolve({ data: dataB })));

    let resolveParamsA: (v: { id: string }) => void = () => {};
    const paramsA = new Promise<{ id: string }>((r) => { resolveParamsA = r; });
    const { rerender } = render(<AdminEditProfessionalPage params={paramsA} />);
    resolveParamsA({ id: 'pA' });
    await vi.waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1));

    rerender(<AdminEditProfessionalPage params={Promise.resolve({ id: 'pB' })} />);
    await vi.waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(screen.getByLabelText('Slug')).toHaveValue('nova'));

    resolveGetA({ data: dataA });
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByLabelText('Slug')).toHaveValue('nova'); // nova permanece
    expect(screen.queryByText('Obsoleta')).not.toBeInTheDocument(); // obsoleta descartada
  });
});

describe('/admin/professionals/[id]/edit — arquivamento', () => {
  const noContent = { data: undefined, status: 204 };

  async function openDialog() {
    fireEvent.click(screen.getByRole('button', { name: 'Arquivar profissional' }));
    return screen.findByRole('alertdialog');
  }

  function actionButton(dialog: HTMLElement) {
    return within(dialog).getByRole('button', { name: /arquivar profissional/i });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('A1. zona de perigo mostra o botão quando a página está pronta', async () => {
    await loaded();
    expect(screen.getByRole('button', { name: 'Arquivar profissional' })).toBeEnabled();
  });

  it('A2. user=null: archive funciona de verdade (dialog → DELETE → toast → redirect)', async () => {
    mockGet.mockResolvedValue({ data: { professional: details.professional, user: null } });
    mockDelete.mockResolvedValue({ data: undefined, status: 204 });
    render(<AdminEditProfessionalPage params={PARAMS} />);
    await screen.findByText('Este profissional não possui usuário associado.');
    const btn = screen.getByRole('button', { name: 'Arquivar profissional' });
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /arquivar profissional/i }));
    // Archive não depende de User — DELETE no id do Professional.
    await vi.waitFor(() => expect(mockDelete).toHaveBeenCalledWith('/admin/professionals/p1'));
    await vi.waitFor(() =>
      expect(mockToastSuccess).toHaveBeenCalledWith('Profissional arquivado com sucesso.'),
    );
    expect(mockPush).toHaveBeenCalledWith('/admin/professionals');
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it('A3. abrir o diálogo não dispara nenhum request', async () => {
    await loaded();
    await openDialog();
    expect(mockDelete).not.toHaveBeenCalled();
    expect(mockGet).toHaveBeenCalledTimes(1); // somente o GET inicial
  });

  it('A4. título exato e descrição completa; sem palavra "definitiv"', async () => {
    await loaded();
    const dialog = await openDialog();
    expect(within(dialog).getByText('Arquivar profissional?')).toBeInTheDocument();
    const desc = within(dialog).getByText(/Agendamentos existentes serão preservados/);
    expect(desc.textContent).toMatch(/deixa de aparecer publicamente/);
    expect(desc.textContent).toMatch(/login fica bloqueado/);
    expect(desc.textContent).toMatch(/Novos agendamentos ficam bloqueados/);
    expect(desc.textContent).toMatch(/dados e o histórico são mantidos/);
    expect(desc.textContent).toMatch(/Não há restauração/);
    expect(document.body.textContent).not.toMatch(/definitiv/);
  });

  it('A5. Cancelar fecha o diálogo com zero DELETE', async () => {
    await loaded();
    const dialog = await openDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    await vi.waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(mockDelete).not.toHaveBeenCalled();
    expect(mockToastSuccess).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled(); // cancelar também não redireciona
  });

  it('A6. confirmar → DELETE no endpoint exato, sem segundo argumento (sem body)', async () => {
    await loaded();
    mockDelete.mockResolvedValue(noContent);
    const dialog = await openDialog();
    fireEvent.click(actionButton(dialog));
    await vi.waitFor(() => expect(mockDelete).toHaveBeenCalledTimes(1));
    expect(mockDelete.mock.calls[0]).toHaveLength(1); // api.delete(url) — sem body
    expect(mockDelete).toHaveBeenCalledWith('/admin/professionals/p1');
  });

  it('A7. pending: ação vira "Arquivando..." disabled e Cancelar fica disabled', async () => {
    await loaded();
    let resolveDelete: (v: unknown) => void = () => {};
    mockDelete.mockReturnValue(new Promise((r) => { resolveDelete = r; }));
    const dialog = await openDialog();
    fireEvent.click(actionButton(dialog));
    await vi.waitFor(() => expect(mockDelete).toHaveBeenCalledTimes(1));
    expect(within(dialog).getByRole('button', { name: 'Arquivando...' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    resolveDelete(noContent);
  });

  it('A8. duplo clique síncrono (race real, antes do rerender disabled) → exatamente 1 DELETE', async () => {
    await loaded();
    let resolveDelete: (v: unknown) => void = () => {};
    mockDelete.mockReturnValue(new Promise((r) => { resolveDelete = r; }));
    const dialog = await openDialog();
    const action = actionButton(dialog);
    fireEvent.click(action); // 1º clique — dispara o DELETE e liga a ref
    fireEvent.click(action); // 2º clique síncrono — botão ainda não re-renderizou
    await new Promise((r) => setTimeout(r, 20));
    expect(mockDelete).toHaveBeenCalledTimes(1); // guard síncrono (ref) bloqueou
    resolveDelete(noContent);
  });

  it('A9. 204 → toast de sucesso + redirect para a listagem', async () => {
    await loaded();
    mockDelete.mockResolvedValue(noContent);
    const dialog = await openDialog();
    fireEvent.click(actionButton(dialog));
    await vi.waitFor(() =>
      expect(mockToastSuccess).toHaveBeenCalledWith('Profissional arquivado com sucesso.'),
    );
    expect(mockPush).toHaveBeenCalledWith('/admin/professionals');
    expect(mockToastError).not.toHaveBeenCalled();
    // Sucesso sem segunda request: nenhum PATCH/refetch além do GET inicial.
    expect(mockPatch).not.toHaveBeenCalled();
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('A10. 204 idempotente (confirmação repetida) → mesmo caminho de sucesso', async () => {
    await loaded();
    mockDelete.mockResolvedValue(noContent);
    let dialog = await openDialog();
    fireEvent.click(actionButton(dialog));
    await vi.waitFor(() => expect(mockDelete).toHaveBeenCalledTimes(1));
    // O diálogo fecha no sucesso; a página permanece montada (push mockado).
    await vi.waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    dialog = await openDialog();
    fireEvent.click(actionButton(dialog));
    await vi.waitFor(() => expect(mockDelete).toHaveBeenCalledTimes(2));
    expect(mockToastSuccess).toHaveBeenCalledTimes(2);
    expect(mockPush).toHaveBeenCalledTimes(2);
  });

  it('A11. 404 → toast "Profissional não encontrado." + redirect para a listagem', async () => {
    await loaded();
    mockDelete.mockRejectedValue(apiError(404, 'Profissional não encontrado.'));
    const dialog = await openDialog();
    fireEvent.click(actionButton(dialog));
    await vi.waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith('Profissional não encontrado.'),
    );
    expect(mockPush).toHaveBeenCalledWith('/admin/professionals');
    expect(mockToastSuccess).not.toHaveBeenCalled();
  });

  it('A12. 403 comum → erro seguro inline, sem logout e sem redirect', async () => {
    localStorage.setItem('token', 't');
    await loaded();
    mockDelete.mockRejectedValue(apiError(403));
    const dialog = await openDialog();
    fireEvent.click(actionButton(dialog));
    await vi.waitFor(() =>
      expect(within(dialog).getByText('Acesso negado para esta área.')).toBeInTheDocument(),
    );
    expect(localStorage.getItem('token')).toBe('t');
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockToastSuccess).not.toHaveBeenCalled();
  });

  it('A13. 5xx → permanece na página com erro seguro e retry funciona', async () => {
    await loaded();
    mockDelete.mockRejectedValueOnce(apiError(500));
    const dialog = await openDialog();
    fireEvent.click(actionButton(dialog));
    await vi.waitFor(() =>
      expect(
        within(dialog).getByText('Não foi possível arquivar o profissional. Tente novamente.'),
      ).toBeInTheDocument(),
    );
    expect(mockPush).not.toHaveBeenCalled();
    mockDelete.mockResolvedValue(noContent);
    fireEvent.click(actionButton(dialog));
    await vi.waitFor(() => expect(mockDelete).toHaveBeenCalledTimes(2));
    await vi.waitFor(() =>
      expect(mockToastSuccess).toHaveBeenCalledWith('Profissional arquivado com sucesso.'),
    );
    expect(mockPush).toHaveBeenCalledWith('/admin/professionals');
  });

  it('A14. erro de rede (sem response) → erro seguro, permanece na página', async () => {
    await loaded();
    mockDelete.mockRejectedValue(new Error('Network Error'));
    const dialog = await openDialog();
    fireEvent.click(actionButton(dialog));
    await vi.waitFor(() =>
      expect(
        within(dialog).getByText('Não foi possível arquivar o profissional. Tente novamente.'),
      ).toBeInTheDocument(),
    );
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockToastSuccess).not.toHaveBeenCalled();
  });

  it('A15. 401 não gera tratamento local (interceptor cuida do logout)', async () => {
    await loaded();
    mockDelete.mockRejectedValue(apiError(401));
    const dialog = await openDialog();
    fireEvent.click(actionButton(dialog));
    await vi.waitFor(() => expect(mockDelete).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockToastSuccess).not.toHaveBeenCalled();
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it('A16. loading inicial não mostra a zona de perigo', () => {
    mockGet.mockReturnValue(new Promise(() => {}));
    render(<AdminEditProfessionalPage params={PARAMS} />);
    expect(screen.queryByRole('button', { name: 'Arquivar profissional' })).not.toBeInTheDocument();
  });

  it('A17. save normal (PATCH) continua funcionando com a zona de perigo presente', async () => {
    await loaded();
    mockPatch.mockResolvedValue({ data: details });
    submit();
    await vi.waitFor(() =>
      expect(mockToastSuccess).toHaveBeenCalledWith('Profissional atualizado com sucesso.'),
    );
    expect(mockPush).toHaveBeenCalledWith('/admin/professionals');
    expect(mockDelete).not.toHaveBeenCalled();
  });
});
