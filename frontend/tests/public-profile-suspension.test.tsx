import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// react-calendar e CustomerAppointments são mockados para determinismo no jsdom.
vi.mock('react-calendar', () => ({
  default: ({ onChange }: { onChange?: (v: Date) => void }) => (
    <button onClick={() => onChange?.(new Date(2026, 10, 5))}>pick-day</button>
  ),
}));

vi.mock('@/components/public/CustomerAppointments', () => ({
  default: () => <div data-testid="customer-appointments" />,
}));

vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
  },
}));

import api from '@/lib/api';
import ProfessionalPage from '@/app/professional/[slug]/page';

const mockGet = vi.mocked(api.get);
const mockPost = vi.mocked(api.post);

const WARNING =
  'Este profissional não está aceitando novos agendamentos no momento.';

type ProfFixture = {
  id: string;
  slug: string;
  name: string;
  bio: string | null;
  avatarUrl: string | null;
  instagram: string | null;
  facebook: string | null;
  whatsapp: string | null;
  themeColors: { primary: string; secondary: string; accent: string } | null;
  status: 'ACTIVE' | 'SUSPENDED';
};

const profAtivo: ProfFixture = {
  id: 'p1',
  slug: 'jessicasantana',
  name: 'Jéssica Santana',
  bio: 'Amo cuidar de vocês!',
  avatarUrl: null,
  instagram: 'jessica',
  facebook: null,
  whatsapp: '81999999999',
  themeColors: null,
  status: 'ACTIVE',
};

const profSuspenso: ProfFixture = { ...profAtivo, status: 'SUSPENDED' };

const services = [
  {
    id: 's1',
    name: 'Manicure',
    description: 'Unhas pintadas',
    durationMinutes: 45,
    price: 60,
    isActive: true,
  },
];

let availableResponse = {
  available: true,
  slots: [{ time: '10:00', available: true }],
  message: undefined as string | undefined,
};

function mockApiFor(prof: ProfFixture) {
  mockGet.mockImplementation((url: string) => {
    if (url.startsWith('/professionals/slug/'))
      return Promise.resolve({ data: prof });
    if (url.startsWith('/services/professional/'))
      return Promise.resolve({ data: services });
    if (url === '/appointments/available')
      return Promise.resolve({ data: availableResponse });
    return Promise.resolve({ data: null });
  });
}

function renderPage() {
  return render(
    <ProfessionalPage params={Promise.resolve({ slug: 'jessicasantana' })} />,
  );
}

async function pickServiceAndDate() {
  // Aguarda o fim do loading (spinner) antes de interagir.
  expect(await screen.findByText('Jéssica Santana')).toBeInTheDocument();
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 's1' } });
  fireEvent.click(await screen.findByText('pick-day'));
}

async function fillEverythingAndTryBooking() {
  await pickServiceAndDate();
  const slot = await screen.findByRole('button', { name: '10:00' });
  fireEvent.click(slot);
  fireEvent.change(screen.getByLabelText('Nome completo'), {
    target: { value: 'Cliente Teste' },
  });
  fireEvent.change(screen.getByLabelText('WhatsApp'), {
    target: { value: '81988888888' },
  });
  return screen.getByRole('button', { name: /Confirmar agendamento/i });
}

let alertMock: ReturnType<typeof vi.fn>;

describe('/professional/[slug] — conta suspensa', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    availableResponse = {
      available: true,
      slots: [{ time: '10:00', available: true }],
      message: undefined,
    };
    Element.prototype.scrollIntoView = vi.fn();
    alertMock = vi.fn();
    vi.stubGlobal('alert', alertMock);
  });

  it('ACTIVE mantém o perfil e o fluxo normais', async () => {
    mockApiFor(profAtivo);
    renderPage();
    expect(await screen.findByText('Jéssica Santana')).toBeInTheDocument();
    expect(
      screen.queryByText('Escolha o serviço, a data e o melhor horário para você.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(WARNING)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Confirmar agendamento/i })).toBeInTheDocument();
  });

  it('ACTIVE completa o booking normalmente (POST enviado)', async () => {
    mockApiFor(profAtivo);
    mockPost.mockResolvedValue({ data: { id: 'a1' } });
    renderPage();
    const cta = await fillEverythingAndTryBooking();
    expect(cta).toBeEnabled();
    fireEvent.click(cta);
    await vi.waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost).toHaveBeenCalledWith('/appointments', {
      professionalId: 'p1',
      serviceId: 's1',
      dateTime: '2026-11-05T10:00:00',
      clientName: 'Cliente Teste',
      clientWhats: '81988888888',
    });
    expect(alertMock).not.toHaveBeenCalled();
  });

  it('SUSPENDED mantém o perfil visível com o aviso exato', async () => {
    mockApiFor(profSuspenso);
    renderPage();
    expect(await screen.findByText('Jéssica Santana')).toBeInTheDocument();
    expect(await screen.findByRole('status')).toHaveTextContent(WARNING);
  });

  it('SUSPENDED não expõe o enum técnico como label', async () => {
    mockApiFor(profSuspenso);
    renderPage();
    await screen.findByText(WARNING);
    expect(document.body.textContent).not.toContain('SUSPENDED');
  });

  it('SUSPENDED preserva as informações públicas (bio, serviços, redes)', async () => {
    mockApiFor(profSuspenso);
    renderPage();
    expect(await screen.findByText('Amo cuidar de vocês!')).toBeInTheDocument();
    expect(screen.getByText(/Manicure/)).toBeInTheDocument();
    expect(screen.getByText('Instagram')).toBeInTheDocument();
    // 'WhatsApp' aparece como link social e como label do campo — usar getAll.
    expect(screen.getAllByText('WhatsApp').length).toBeGreaterThan(1);
  });

  it('SUSPENDED mantém o CTA desabilitado mesmo com tudo preenchido (nenhum submit)', async () => {
    mockApiFor(profSuspenso);
    renderPage();
    const cta = await fillEverythingAndTryBooking();
    expect(cta).toBeDisabled();
    fireEvent.click(cta);
    await new Promise((r) => setTimeout(r, 50));
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('SUSPENDED com available=false/slots=[] mostra a indisponibilidade', async () => {
    mockApiFor(profSuspenso);
    availableResponse = {
      available: false,
      slots: [],
      message: WARNING,
    };
    renderPage();
    await pickServiceAndDate();
    expect(await screen.findByText(WARNING)).toBeInTheDocument();
  });

  it('race: ACTIVE que suspende no meio — POST recebe 403 e mostra a mensagem segura', async () => {
    mockApiFor(profAtivo);
    mockPost.mockRejectedValue({
      response: {
        status: 403,
        data: {
          message:
            'Este profissional não está aceitando novos agendamentos no momento.',
        },
      },
    });
    renderPage();
    const cta = await fillEverythingAndTryBooking();
    fireEvent.click(cta);
    await vi.waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    await vi.waitFor(() =>
      expect(alertMock).toHaveBeenCalledWith(
        'Este profissional não está aceitando novos agendamentos no momento.',
      ),
    );
    // O formulário volta ao estado normal (não fica em loading nem em sucesso):
    // o appointment NÃO foi assumido como criado.
    await vi.waitFor(() =>
      expect(cta).toHaveTextContent('Confirmar agendamento'),
    );
    expect(cta).toBeEnabled();
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('sem redirect e sem 404 para profissional suspenso', async () => {
    mockApiFor(profSuspenso);
    renderPage();
    await screen.findByText(WARNING);
    expect(
      screen.queryByText('Profissional não encontrado.'),
    ).not.toBeInTheDocument();
  });
});

describe('/professional/[slug] — perfil arquivado', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    availableResponse = {
      available: true,
      slots: [{ time: '10:00', available: true }],
      message: undefined,
    };
    Element.prototype.scrollIntoView = vi.fn();
    vi.stubGlobal('alert', vi.fn());
  });

  it('archived (GET 404 do backend) cai no not-found atual', async () => {
    mockGet.mockRejectedValue({
      response: { status: 404, data: { message: 'Profissional não encontrado.' } },
    });
    renderPage();
    expect(await screen.findByText('Profissional não encontrado.')).toBeInTheDocument();
  });

  it('not-found não revela archived/desativado', async () => {
    mockGet.mockRejectedValue({
      response: { status: 404, data: { message: 'Profissional não encontrado.' } },
    });
    renderPage();
    await screen.findByText('Profissional não encontrado.');
    expect(document.body.textContent).not.toMatch(/desativado/i);
    expect(document.body.textContent).not.toMatch(/arquiv/i);
    expect(document.body.textContent).not.toMatch(/archived/i);
  });

  it('not-found não mostra formulário de booking', async () => {
    mockGet.mockRejectedValue({
      response: { status: 404, data: { message: 'Profissional não encontrado.' } },
    });
    renderPage();
    await screen.findByText('Profissional não encontrado.');
    expect(
      screen.queryByText('Escolha o serviço, a data e o melhor horário para você.'),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('regressão: ACTIVE continua normal com a zona archived presente', async () => {
    mockApiFor(profAtivo);
    renderPage();
    expect(await screen.findByText('Jéssica Santana')).toBeInTheDocument();
    expect(
      screen.queryByText('Profissional não encontrado.'),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Confirmar agendamento/i })).toBeInTheDocument();
  });
});
