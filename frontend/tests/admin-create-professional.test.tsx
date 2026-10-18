import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';

const { mockPush, mockGet, mockPost, mockToastSuccess } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  mockToastSuccess: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn() }),
  usePathname: () => '/admin/professionals/new',
}));

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children?: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@/lib/api', () => ({
  default: {
    get: mockGet,
    post: mockPost,
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
  },
}));

vi.mock('sonner', () => ({
  toast: { success: mockToastSuccess, error: vi.fn() },
}));

import AdminCreateProfessionalPage from '@/app/admin/(protected)/professionals/new/page';
import AdminProfessionalsPage from '@/app/admin/(protected)/professionals/page';

const SENHA = 'senha-forte-123';

const sucesso = {
  professional: {
    id: 'p1',
    slug: 'ana-pro',
    name: 'Ana Pro',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  user: {
    id: 'u1',
    email: 'ana@test.local',
    firstName: 'Ana',
    lastName: 'Pro',
    role: 'PROFESSIONAL',
    professionalId: 'p1',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
};

type Overrides = Partial<{
  name: string;
  slug: string;
  email: string;
  firstName: string;
  lastName: string;
  password: string;
}>;

// Preenche o formulário inteiro (padrão = válido). Overrides testam campos.
function fillForm(overrides: Overrides = {}) {
  const v = {
    name: 'Ana Pro',
    slug: 'ana-pro',
    email: 'ana@test.local',
    firstName: 'Ana',
    lastName: 'Pro',
    password: SENHA,
    ...overrides,
  };
  fireEvent.change(screen.getByLabelText('Nome profissional'), { target: { value: v.name } });
  fireEvent.change(screen.getByLabelText('Slug'), { target: { value: v.slug } });
  fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: v.email } });
  fireEvent.change(screen.getByLabelText('Primeiro nome'), { target: { value: v.firstName } });
  fireEvent.change(screen.getByLabelText('Sobrenome'), { target: { value: v.lastName } });
  fireEvent.change(screen.getByLabelText('Senha inicial'), { target: { value: v.password } });
  return v;
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: /criar profissional/i }));
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('/admin/professionals/new — formulário de criação', () => {
  it('1. renderiza os 6 campos e o botão de envio', () => {
    render(<AdminCreateProfessionalPage />);
    expect(screen.getByLabelText('Nome profissional')).toBeInTheDocument();
    expect(screen.getByLabelText('Slug')).toBeInTheDocument();
    expect(screen.getByLabelText('E-mail')).toBeInTheDocument();
    expect(screen.getByLabelText('Primeiro nome')).toBeInTheDocument();
    expect(screen.getByLabelText('Sobrenome')).toBeInTheDocument();
    expect(screen.getByLabelText('Senha inicial')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /criar profissional/i })).toBeInTheDocument();
  });

  it('2. campos obrigatórios impedem o submit', async () => {
    render(<AdminCreateProfessionalPage />);
    submit();
    await vi.waitFor(() =>
      expect(screen.getByText('Informe o nome profissional.')).toBeInTheDocument()
    );
    expect(screen.getByText('Informe o slug.')).toBeInTheDocument();
    expect(screen.getByText('Informe o e-mail.')).toBeInTheDocument();
    expect(screen.getByText('Informe o primeiro nome.')).toBeInTheDocument();
    expect(screen.getByText('Informe o sobrenome.')).toBeInTheDocument();
    expect(screen.getByText('Informe a senha inicial.')).toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('3. password com menos de 8 caracteres mostra validação', async () => {
    render(<AdminCreateProfessionalPage />);
    fillForm({ password: '123' });
    submit();
    await vi.waitFor(() =>
      expect(screen.getByText('A senha deve ter no mínimo 8 caracteres.')).toBeInTheDocument()
    );
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('4. email inválido mostra validação', async () => {
    render(<AdminCreateProfessionalPage />);
    fillForm({ email: 'email-invalido' });
    submit();
    await vi.waitFor(() => expect(screen.getByText('E-mail inválido.')).toBeInTheDocument());
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('5. slug inválido mostra validação', async () => {
    render(<AdminCreateProfessionalPage />);
    fillForm({ slug: 'SMOKE INVALID' });
    submit();
    await vi.waitFor(() =>
      expect(screen.getByText('Use apenas letras minúsculas, números e hífens.')).toBeInTheDocument()
    );
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('6. nome sugere slug automaticamente (com acentos convertidos)', async () => {
    render(<AdminCreateProfessionalPage />);
    fireEvent.change(screen.getByLabelText('Nome profissional'), {
      target: { value: 'Jéssica Santana' },
    });
    await vi.waitFor(() =>
      expect(screen.getByLabelText('Slug')).toHaveValue('jessica-santana')
    );
    fireEvent.change(screen.getByLabelText('Nome profissional'), {
      target: { value: 'Ana Ávila Çonceição' },
    });
    await vi.waitFor(() =>
      expect(screen.getByLabelText('Slug')).toHaveValue('ana-avila-conceicao')
    );
  });

  it('7. edição manual do slug impede sobrescrita por mudança posterior do nome', async () => {
    render(<AdminCreateProfessionalPage />);
    fireEvent.change(screen.getByLabelText('Nome profissional'), {
      target: { value: 'Ana Souza' },
    });
    await vi.waitFor(() => expect(screen.getByLabelText('Slug')).toHaveValue('ana-souza'));
    fireEvent.change(screen.getByLabelText('Slug'), { target: { value: 'meu-slug' } });
    fireEvent.change(screen.getByLabelText('Nome profissional'), {
      target: { value: 'Ana Souza Lima' },
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByLabelText('Slug')).toHaveValue('meu-slug');
  });

  it('8. payload do POST contém exatamente os 6 campos', async () => {
    mockPost.mockResolvedValue({ data: sucesso });
    render(<AdminCreateProfessionalPage />);
    const v = fillForm();
    submit();
    await vi.waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost.mock.calls[0][0]).toBe('/admin/professionals');
    expect(mockPost.mock.calls[0][1]).toEqual({
      name: v.name,
      slug: v.slug,
      email: v.email,
      firstName: v.firstName,
      lastName: v.lastName,
      password: v.password,
    });
  });

  it('9. role não vai no payload', async () => {
    mockPost.mockResolvedValue({ data: sucesso });
    render(<AdminCreateProfessionalPage />);
    fillForm();
    submit();
    await vi.waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost.mock.calls[0][1]).not.toHaveProperty('role');
  });

  it('10. professionalId não vai no payload', async () => {
    mockPost.mockResolvedValue({ data: sucesso });
    render(<AdminCreateProfessionalPage />);
    fillForm();
    submit();
    await vi.waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost.mock.calls[0][1]).not.toHaveProperty('professionalId');
  });

  it('11. botão fica disabled durante o submit e duplo clique não duplica request', async () => {
    render(<AdminCreateProfessionalPage />);
    fillForm();
    let resolvePost: (v: unknown) => void = () => {};
    mockPost.mockImplementation(() => new Promise((r) => { resolvePost = r; }));
    const btn = screen.getByRole('button', { name: /criar profissional/i });
    fireEvent.click(btn);
    await vi.waitFor(() => expect(btn).toBeDisabled());
    fireEvent.click(btn); // botão disabled — não dispara novo submit
    await new Promise((r) => setTimeout(r, 20));
    resolvePost({ data: sucesso });
    await vi.waitFor(() => expect(mockPush).toHaveBeenCalledWith('/admin/professionals'));
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('12. 201 dispara toast de sucesso e redireciona para a listagem', async () => {
    mockPost.mockResolvedValue({ data: sucesso });
    render(<AdminCreateProfessionalPage />);
    fillForm();
    submit();
    await vi.waitFor(() =>
      expect(mockToastSuccess).toHaveBeenCalledWith('Profissional criado com sucesso.')
    );
    expect(mockPush).toHaveBeenCalledWith('/admin/professionals');
  });

  it('13. password não aparece em toast/mensagem após o envio', async () => {
    mockPost.mockResolvedValue({ data: sucesso });
    render(<AdminCreateProfessionalPage />);
    fillForm();
    submit();
    await vi.waitFor(() => expect(mockToastSuccess).toHaveBeenCalled());
    const todosOsTextos = document.body.textContent ?? '';
    expect(mockToastSuccess.mock.calls.flat().join(' ')).not.toContain(SENHA);
    expect(todosOsTextos).not.toContain(SENHA);
  });

  it('14. 409 de email mostra erro junto ao campo email', async () => {
    mockPost.mockRejectedValue({
      response: { status: 409, data: { message: 'E-mail já cadastrado.' } },
    });
    render(<AdminCreateProfessionalPage />);
    fillForm();
    submit();
    await vi.waitFor(() => expect(screen.getByText('E-mail já cadastrado.')).toBeInTheDocument());
    expect(screen.getByLabelText('E-mail')).toHaveAttribute('aria-invalid', 'true');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('15. 409 de slug mostra erro junto ao campo slug', async () => {
    mockPost.mockRejectedValue({
      response: { status: 409, data: { message: 'Slug já cadastrado.' } },
    });
    render(<AdminCreateProfessionalPage />);
    fillForm();
    submit();
    await vi.waitFor(() => expect(screen.getByText('Slug já cadastrado.')).toBeInTheDocument());
    expect(screen.getByLabelText('Slug')).toHaveAttribute('aria-invalid', 'true');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('16. 409 com target desconhecido vira erro geral (sem adivinhar campo)', async () => {
    mockPost.mockRejectedValue({
      response: { status: 409, data: { message: 'Já existe um cadastro com esses dados.' } },
    });
    render(<AdminCreateProfessionalPage />);
    fillForm();
    submit();
    await vi.waitFor(() =>
      expect(screen.getByText('Já existe um cadastro com esses dados.')).toBeInTheDocument()
    );
    expect(screen.getByLabelText('E-mail')).not.toHaveAttribute('aria-invalid');
    expect(screen.getByLabelText('Slug')).not.toHaveAttribute('aria-invalid');
  });

  it('17. 400 mostra erro de validação de forma legível', async () => {
    mockPost.mockRejectedValue({
      response: {
        status: 400,
        data: { message: ['slug must match /^[a-z0-9-]+$/ regular expression', 'email must be an email'] },
      },
    });
    render(<AdminCreateProfessionalPage />);
    fillForm();
    submit();
    await vi.waitFor(() =>
      expect(screen.getByText(/email must be an email/)).toBeInTheDocument()
    );
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('18. 403 mostra acesso negado sem logout manual', async () => {
    localStorage.setItem('token', 'token-do-admin');
    mockPost.mockRejectedValue({
      response: { status: 403, data: { message: 'Forbidden' } },
    });
    render(<AdminCreateProfessionalPage />);
    fillForm();
    submit();
    await vi.waitFor(() =>
      expect(screen.getByText('Acesso negado para esta área.')).toBeInTheDocument()
    );
    expect(localStorage.getItem('token')).toBe('token-do-admin');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('19. 500 mostra mensagem genérica e permite retry', async () => {
    mockPost.mockRejectedValueOnce({
      response: { status: 500, data: { message: 'Internal server error' } },
    });
    render(<AdminCreateProfessionalPage />);
    fillForm();
    submit();
    await vi.waitFor(() =>
      expect(screen.getByText('Não foi possível criar o profissional. Tente novamente.')).toBeInTheDocument()
    );
    // Formulário permanece preenchido e utilizável para nova tentativa.
    expect(screen.getByLabelText('Slug')).toHaveValue('ana-pro');
    const btn = screen.getByRole('button', { name: /criar profissional/i });
    expect(btn).toBeEnabled();
    mockPost.mockResolvedValue({ data: sucesso });
    fireEvent.click(btn);
    await vi.waitFor(() => expect(mockPost).toHaveBeenCalledTimes(2));
    expect(mockPush).toHaveBeenCalledWith('/admin/professionals');
  });
});

describe('/admin/professionals — entrada para a criação', () => {
  it('20. listagem tem botão "Novo profissional" apontando para /admin/professionals/new', async () => {
    mockGet.mockResolvedValue({
      data: { items: [], total: 0, limit: 20, offset: 0 },
    });
    render(<AdminProfessionalsPage />);
    const link = await screen.findByRole('link', { name: /novo profissional/i });
    expect(link).toHaveAttribute('href', '/admin/professionals/new');
  });
});
