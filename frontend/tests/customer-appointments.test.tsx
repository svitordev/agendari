import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';

const { mockGet, mockPatch, mockToastSuccess, mockToastError } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPatch: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  default: {
    get: mockGet,
    post: vi.fn(),
    patch: mockPatch,
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
  },
}));

vi.mock('sonner', () => ({
  toast: { success: mockToastSuccess, error: mockToastError },
}));

import CustomerAppointments from '@/components/public/CustomerAppointments';

// ---------------------------------------------------------------------------
// Fixtures — datas relativas ao momento real (sem fake timers).
// IDs distintos para provar que nenhum id interno aparece na UI.
// ---------------------------------------------------------------------------

const DAY = 86_400_000;
const NOW = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();

const F1 = iso(NOW + 3 * DAY);
const F2 = iso(NOW + 5 * DAY);
const P1 = iso(NOW - 5 * DAY);
const P2 = iso(NOW - 3 * DAY);

const PHONE_DIGITS = '11999990000';

type Row = {
  id: string;
  date: string;
  status: string;
  cancellationReason?: string | null;
  cancelledBy?: string | null;
  cancelledAt?: string | null;
  customer: { id: string; name: string; phone: string };
  service: { id: string; name: string; durationMinutes: number; price: number };
  professional?: { id: string; name: string; slug?: string; whatsapp?: string | null };
};

function appt(id: string, status: string, date: string, serviceName: string, extra: object = {}): Row {
  return {
    id,
    date,
    status,
    customer: { id: 'zzcust-x', name: 'Todos Iguais', phone: PHONE_DIGITS },
    service: { id: 'zzserv-x', name: serviceName, durationMinutes: 60, price: 150 },
    ...extra,
  };
}

const PRO_ACTIVE = { id: 'zzprof-1', name: 'Pro Ativa', slug: 'zz-pro-ativa', whatsapp: null };
const PRO_SUSPENSA = { id: 'zzprof-2', name: 'Pro Suspensa', slug: 'zz-pro-suspensa', whatsapp: null };
const PRO_ARQUIVADA = { id: 'zzprof-3', name: 'Pro Arquivada', slug: 'zz-pro-arquivada', whatsapp: null };

function fixture(): Row[] {
  return [
    appt('zzid-001', 'PENDING', F1, 'Servico Ana', { professional: PRO_ACTIVE }),
    appt('zzid-002', 'CONFIRMED', F2, 'Servico Bia', { professional: PRO_SUSPENSA }),
    appt('zzid-003', 'PENDING', P2, 'Servico Caro', { professional: PRO_ACTIVE }),
    appt('zzid-004', 'CONFIRMED', P1, 'Servico Duda', { professional: PRO_ACTIVE }),
    appt('zzid-005', 'CANCELLED', P2, 'Servico Elba', { cancelledBy: 'CUSTOMER' }),
    appt('zzid-006', 'COMPLETED', P1, 'Servico Faia', { professional: PRO_ACTIVE }),
    appt('zzid-007', 'NO_SHOW', P2, 'Servico Gala', { professional: PRO_ARQUIVADA }),
  ];
}

// Ordem esperada: Próximos asc [Ana, Bia]; Histórico desc [Caro, Elba, Gala (P2), Duda, Faia (P1)].
const PROXIMOS_ORDER = ['Servico Ana', 'Servico Bia'];
const HISTORICO_ORDER = ['Servico Caro', 'Servico Elba', 'Servico Gala', 'Servico Duda', 'Servico Faia'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cards() {
  return screen.getAllByTestId('appointment-card');
}

function cardNames() {
  return cards().map((c) => c.querySelectorAll('p')[1]?.textContent);
}

function card(serviceName: string) {
  const el = cards().find((c) => c.textContent?.includes(serviceName)) as HTMLElement;
  return within(el);
}

async function dialog() {
  return within(await screen.findByRole('alertdialog', {}, { timeout: 3000 }));
}

function apiError(status: number, message?: string | string[]) {
  return { response: { status, data: message === undefined ? {} : { message } } };
}

async function searchFixture(rows: Row[] = fixture()) {
  render(<CustomerAppointments />);
  mockGet.mockResolvedValue({ data: rows });
  fireEvent.change(screen.getByPlaceholderText(/Telefone com DDD/), {
    target: { value: PHONE_DIGITS },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Buscar agendamentos' }));
  await waitFor(() => expect(screen.getAllByTestId('appointment-card').length).toBeGreaterThan(0));
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  window.history.pushState({}, '', '/');
});

afterEach(() => {
  window.history.pushState({}, '', '/');
});

// ---------------------------------------------------------------------------
// 1. Busca, URL e feedback
// ---------------------------------------------------------------------------

describe('Busca por telefone e URL', () => {
  it('1. formulário inicial: input + botão; botão desabilitado sem telefone', () => {
    render(<CustomerAppointments />);
    expect(screen.getByPlaceholderText(/Telefone com DDD/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Buscar agendamentos' })).toBeDisabled();
    expect(screen.queryByRole('tab')).toBeNull();
  });

  it('2. telefone inválido (<10 dígitos) bloqueia antes do request', async () => {
    render(<CustomerAppointments />);
    fireEvent.change(screen.getByPlaceholderText(/Telefone com DDD/), { target: { value: '12345678' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar agendamentos' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Informe um WhatsApp válido.');
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('3. loading durante o request (Buscando...)', async () => {
    let resolveGet: (v: { data: Row[] }) => void;
    mockGet.mockReturnValue(new Promise((r) => (resolveGet = r)));
    render(<CustomerAppointments />);
    fireEvent.change(screen.getByPlaceholderText(/Telefone com DDD/), { target: { value: PHONE_DIGITS } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar agendamentos' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Buscando...' })).toBeInTheDocument(),
    );
    resolveGet!({ data: fixture() });
    await screen.findAllByTestId('appointment-card');
  });

  it('4. GET by-phone com telefone normalizado', async () => {
    mockGet.mockResolvedValue({ data: fixture() });
    render(<CustomerAppointments />);
    fireEvent.change(screen.getByPlaceholderText(/Telefone com DDD/), {
      target: { value: '(11) 99999-0000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar agendamentos' }));
    await screen.findAllByTestId('appointment-card');
    expect(mockGet).toHaveBeenCalledWith('/appointments/by-phone', {
      params: { phone: PHONE_DIGITS },
    });
  });

  it('5. telefone NÃO vai para a URL no fluxo novo', async () => {
    await searchFixture();
    expect(window.location.search).toBe('');
  });

  it('6. link legado ?phone=...&confirmed=1 continua lido (compatibilidade) + CTA', async () => {
    window.history.pushState({}, '', `/agendamentos?phone=${PHONE_DIGITS}&confirmed=1`);
    mockGet.mockResolvedValue({ data: fixture() });
    render(<CustomerAppointments readQueryParams />);
    await waitFor(() =>
      expect(mockGet).toHaveBeenCalledWith('/appointments/by-phone', {
        params: { phone: PHONE_DIGITS },
      }),
    );
    expect(await screen.findByText('Agendamento realizado com sucesso!')).toBeInTheDocument();
    const cta = screen.getByRole('button', { name: 'Ver meus agendamentos' });
    fireEvent.click(cta);
    // O CTA apenas foca a busca — nenhum request extra.
    await new Promise((r) => setTimeout(r, 50));
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('7. 404 nenhum cliente → empty state amigável (não erro crítico)', async () => {
    mockGet.mockRejectedValue(
      apiError(404, 'Nenhum cliente encontrado para este telefone.'),
    );
    render(<CustomerAppointments />);
    fireEvent.change(screen.getByPlaceholderText(/Telefone com DDD/), { target: { value: PHONE_DIGITS } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar agendamentos' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Nenhum agendamento encontrado.',
    );
  });

  it('8. 429 na busca → mensagem fixa (sem body arbitrário)', async () => {
    mockGet.mockRejectedValue(apiError(429, 'qualquer coisa'));
    render(<CustomerAppointments />);
    fireEvent.change(screen.getByPlaceholderText(/Telefone com DDD/), { target: { value: PHONE_DIGITS } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar agendamentos' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Muitas tentativas. Aguarde um momento e tente novamente.',
    );
  });

  it('9. 5xx → fallback seguro e retry funciona', async () => {
    mockGet.mockRejectedValueOnce(apiError(500));
    render(<CustomerAppointments />);
    fireEvent.change(screen.getByPlaceholderText(/Telefone com DDD/), { target: { value: PHONE_DIGITS } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar agendamentos' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Algo deu errado. Tente novamente.',
    );
    mockGet.mockResolvedValue({ data: fixture() });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar agendamentos' }));
    await screen.findAllByTestId('appointment-card');
  });

  it('10. busca sem resultados → empty state amigável', async () => {
    mockGet.mockResolvedValue({ data: [] });
    render(<CustomerAppointments />);
    fireEvent.change(screen.getByPlaceholderText(/Telefone com DDD/), { target: { value: PHONE_DIGITS } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar agendamentos' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Nenhum agendamento encontrado.',
    );
  });
});

// ---------------------------------------------------------------------------
// 2. Tabs Próximos / Histórico, labels e dados
// ---------------------------------------------------------------------------

describe('Tabs, labels e cards', () => {
  it('11. tab padrão é Próximos: apenas PENDING/CONFIRMED futuros, mais próximo primeiro', async () => {
    await searchFixture();
    expect(screen.getByRole('tab', { name: /próximos/i })).toHaveAttribute('aria-selected', 'true');
    expect(cardNames()).toEqual(PROXIMOS_ORDER);
  });

  it('12. Histórico: terminais + passados, mais recente primeiro', async () => {
    await searchFixture();
    fireEvent.click(screen.getByRole('tab', { name: /histórico/i }));
    expect(cardNames()).toEqual(HISTORICO_ORDER);
  });

  it('13. PENDING passado fica no Histórico com indicação de horário passado', async () => {
    await searchFixture();
    fireEvent.click(screen.getByRole('tab', { name: /histórico/i }));
    const c = card('Servico Caro');
    expect(c.getByText('Aguardando confirmação')).toBeInTheDocument();
    expect(c.getByText('O horário já passou.')).toBeInTheDocument();
  });

  it('14. CONFIRMED passado fica no Histórico com indicação de horário passado', async () => {
    await searchFixture();
    fireEvent.click(screen.getByRole('tab', { name: /histórico/i }));
    const c = card('Servico Duda');
    expect(c.getByText('Confirmado')).toBeInTheDocument();
    expect(c.getByText('O horário já passou.')).toBeInTheDocument();
  });

  it('15. labels PT-BR corretas e enum cru ausente', async () => {
    await searchFixture();
    const ana = card('Servico Ana');
    expect(ana.getByText('Aguardando confirmação')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /histórico/i }));
    expect(card('Servico Elba').getByText('Cancelado por você')).toBeInTheDocument();
    expect(card('Servico Faia').getByText('Concluído')).toBeInTheDocument();
    expect(card('Servico Gala').getByText('Não compareceu')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\bPENDING\b/);
    expect(document.body.textContent).not.toMatch(/\bCONFIRMED\b/);
    expect(document.body.textContent).not.toMatch(/\bCANCELLED\b/);
    expect(document.body.textContent).not.toMatch(/\bCOMPLETED\b/);
    expect(document.body.textContent).not.toMatch(/\bNO_SHOW\b/);
  });

  it('16. Próximos vazio com estado próprio; dados aparecem no Histórico', async () => {
    mockGet.mockResolvedValue({ data: fixture().filter((r) => r.date < iso(NOW)) });
    render(<CustomerAppointments />);
    fireEvent.change(screen.getByPlaceholderText(/Telefone com DDD/), { target: { value: PHONE_DIGITS } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar agendamentos' }));
    expect(await screen.findByText('Nenhum próximo agendamento.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /histórico/i }));
    expect(cardNames()).toEqual(HISTORICO_ORDER);
  });

  it('17. Histórico vazio com estado próprio', async () => {
    await searchFixture(fixture().filter((r) => r.date > iso(NOW)));
    fireEvent.click(screen.getByRole('tab', { name: /histórico/i }));
    expect(screen.getByText('Nenhum agendamento no histórico.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /próximos/i }));
    expect(cardNames()).toEqual(PROXIMOS_ORDER);
  });

  it('18. nenhum id interno aparece na UI', async () => {
    await searchFixture();
    expect(document.body.textContent).not.toContain('zzid-001');
    expect(document.body.textContent).not.toContain('zzcust-x');
    expect(document.body.textContent).not.toContain('zzserv-x');
    expect(document.body.textContent).not.toContain('zzprof-1');
  });

  it('19. card exibe dados úteis: profissional, serviço, data/hora, duração, preço, status', async () => {
    await searchFixture();
    const c = card('Servico Ana');
    expect(c.getByText('Com Pro Ativa')).toBeInTheDocument();
    expect(c.getByText(/🗓️ \d{2}\/\d{2}\/\d{4}/)).toBeInTheDocument();
    expect(c.getByText(/60 minutos/)).toBeInTheDocument();
    expect(c.getByText(/R\$/)).toBeInTheDocument();
    expect(c.getByText('Aguardando confirmação')).toBeInTheDocument();
  });

  it('20. appointments de Professional SUSPENSA e ARQUIVADA continuam renderizados', async () => {
    await searchFixture();
    fireEvent.click(screen.getByRole('tab', { name: /histórico/i }));
    expect(card('Servico Gala')).toBeTruthy(); // archived
    fireEvent.click(screen.getByRole('tab', { name: /próximos/i }));
    expect(card('Servico Bia')).toBeTruthy(); // suspensa
    expect(screen.getByText('Com Pro Suspensa')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /histórico/i }));
    expect(screen.getByText('Com Pro Arquivada')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 3. Ações por status + AlertDialog + response authority
// ---------------------------------------------------------------------------

describe('Ações do cliente e cancelamento', () => {
  it('21. PENDING futuro mostra Cancelar; CONFIRMED futuro mostra Cancelar', async () => {
    await searchFixture();
    expect(card('Servico Ana').getByRole('button', { name: 'Cancelar agendamento' })).toBeInTheDocument();
    expect(card('Servico Bia').getByRole('button', { name: 'Cancelar agendamento' })).toBeInTheDocument();
  });

  it('22. passados (PENDING/CONFIRMED) não mostram Cancelar', async () => {
    await searchFixture();
    fireEvent.click(screen.getByRole('tab', { name: /histórico/i }));
    expect(card('Servico Caro').queryByRole('button', { name: 'Cancelar agendamento' })).toBeNull();
    expect(card('Servico Duda').queryByRole('button', { name: 'Cancelar agendamento' })).toBeNull();
  });

  it('23. terminais não mostram Cancelar', async () => {
    await searchFixture();
    fireEvent.click(screen.getByRole('tab', { name: /histórico/i }));
    expect(card('Servico Elba').queryByRole('button', { name: 'Cancelar agendamento' })).toBeNull();
    expect(card('Servico Faia').queryByRole('button', { name: 'Cancelar agendamento' })).toBeNull();
    expect(card('Servico Gala').queryByRole('button', { name: 'Cancelar agendamento' })).toBeNull();
  });

  it('24. abrir o dialog não dispara PATCH; Voltar fecha com zero PATCH', async () => {
    await searchFixture();
    fireEvent.click(card('Servico Ana').getByRole('button', { name: 'Cancelar agendamento' }));
    const d = await dialog();
    expect(d.getByText('Cancelar agendamento?')).toBeInTheDocument();
    expect(mockPatch).not.toHaveBeenCalled();
    fireEvent.click(d.getByRole('button', { name: 'Voltar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it('25. confirmar envia exatamente { phone } — sem reason', async () => {
    await searchFixture();
    mockPatch.mockResolvedValue({ data: {} });
    fireEvent.click(card('Servico Ana').getByRole('button', { name: 'Cancelar agendamento' }));
    const d = await dialog();
    fireEvent.click(d.getByRole('button', { name: 'Cancelar agendamento' }));
    await waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(1));
    expect(mockPatch).toHaveBeenCalledWith('/appointments/zzid-001/cancel-public', {
      phone: PHONE_DIGITS,
    });
  });

  it('26. loading no alvo + double submit → 1 PATCH', async () => {
    await searchFixture();
    let resolvePatch: (v: { data: Record<string, unknown> }) => void;
    mockPatch.mockReturnValue(new Promise((r) => (resolvePatch = r)));
    fireEvent.click(card('Servico Ana').getByRole('button', { name: 'Cancelar agendamento' }));
    const d = await dialog();
    const action = d.getByRole('button', { name: 'Cancelar agendamento' });
    fireEvent.click(action);
    fireEvent.click(action);
    await waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(within(screen.getByRole('alertdialog')).getByText('Cancelando...')).toBeInTheDocument(),
    );
    resolvePatch!({ data: {} });
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2)); // refetch pós-sucesso
    // No sucesso o dialog fecha explicitamente — não fica preso.
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('27. sem optimistic update: durante o pending o card mantém o status original', async () => {
    await searchFixture();
    let resolvePatch: (v: { data: Record<string, unknown> }) => void;
    mockPatch.mockReturnValue(new Promise((r) => (resolvePatch = r)));
    fireEvent.click(card('Servico Ana').getByRole('button', { name: 'Cancelar agendamento' }));
    const d = await dialog();
    fireEvent.click(d.getByRole('button', { name: 'Cancelar agendamento' }));
    await waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(1));
    // Badge ainda é o original — nada foi montado localmente.
    expect(card('Servico Ana').getByText('Aguardando confirmação')).toBeInTheDocument();
    // Nenhum label de cancelado pode aparecer antes do refetch retornar.
    expect(document.body.textContent).not.toContain('Cancelado');
    resolvePatch!({ data: {} });
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
  });

  it('28. sucesso → toast + refetch; cancelado permanece no Histórico via refetch', async () => {
    const updated = fixture().map((r) =>
      r.id === 'zzid-001'
        ? { ...r, status: 'CANCELLED', cancelledBy: 'CUSTOMER', cancelledAt: iso(NOW) }
        : r,
    );
    mockGet.mockResolvedValueOnce({ data: fixture() });
    mockGet.mockResolvedValueOnce({ data: updated });
    await renderAndSearch();
    mockPatch.mockResolvedValue({ data: {} });
    fireEvent.click(card('Servico Ana').getByRole('button', { name: 'Cancelar agendamento' }));
    const d = await dialog();
    fireEvent.click(d.getByRole('button', { name: 'Cancelar agendamento' }));
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled());
    // Sai de Próximos e aparece no Histórico com a label correta — só via refetch.
    fireEvent.click(screen.getByRole('tab', { name: /histórico/i }));
    expect(card('Servico Ana').getByText('Cancelado por você')).toBeInTheDocument();
  });

  it('29. erro 400 conhecido → mensagem do contrato + refetch (sem montar local)', async () => {
    await searchFixture();
    mockPatch.mockRejectedValue(apiError(400, 'Este agendamento não pode mais ser cancelado.'));
    fireEvent.click(card('Servico Ana').getByRole('button', { name: 'Cancelar agendamento' }));
    const d = await dialog();
    fireEvent.click(d.getByRole('button', { name: 'Cancelar agendamento' }));
    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith(
        'Este agendamento não pode mais ser cancelado.',
      ),
    );
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
  });

  it('30. erro 404 no cancelamento → mensagem do contrato + refetch', async () => {
    await searchFixture();
    mockPatch.mockRejectedValue(apiError(404, 'Agendamento não encontrado para este telefone.'));
    fireEvent.click(card('Servico Ana').getByRole('button', { name: 'Cancelar agendamento' }));
    const d = await dialog();
    fireEvent.click(d.getByRole('button', { name: 'Cancelar agendamento' }));
    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith(
        'Agendamento não encontrado para este telefone.',
      ),
    );
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
  });

  it('31. erro 429 no cancelamento → mensagem fixa', async () => {
    await searchFixture();
    mockPatch.mockRejectedValue(apiError(429));
    fireEvent.click(card('Servico Ana').getByRole('button', { name: 'Cancelar agendamento' }));
    const d = await dialog();
    fireEvent.click(d.getByRole('button', { name: 'Cancelar agendamento' }));
    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith(
        'Muitas tentativas. Aguarde um momento e tente novamente.',
      ),
    );
  });

  it('32. erro 5xx → fallback, guard libera e retry funciona', async () => {
    await searchFixture();
    mockPatch.mockRejectedValueOnce(apiError(500));
    fireEvent.click(card('Servico Ana').getByRole('button', { name: 'Cancelar agendamento' }));
    const d = await dialog();
    fireEvent.click(d.getByRole('button', { name: 'Cancelar agendamento' }));
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Algo deu errado. Tente novamente.'));
    // Retry — guard liberado, dialog permanece aberto para nova tentativa.
    mockPatch.mockResolvedValue({ data: {} });
    await waitFor(() =>
      expect(
        within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancelar agendamento' }),
      ).toBeEnabled(),
    );
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancelar agendamento' }),
    );
    await waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled());
  });

  it('33. mensagem desconhecida não é refletida — fallback seguro', async () => {
    await searchFixture();
    mockPatch.mockRejectedValue(apiError(400, 'Erro interno xyz inesperado'));
    fireEvent.click(card('Servico Ana').getByRole('button', { name: 'Cancelar agendamento' }));
    const d = await dialog();
    fireEvent.click(d.getByRole('button', { name: 'Cancelar agendamento' }));
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Algo deu errado. Tente novamente.'));
    expect(mockToastError).not.toHaveBeenCalledWith('Erro interno xyz inesperado');
  });

  it('37. motivo do Professional exibido; cancel por você não renderiza bloco vazio', async () => {
    const rows = [
      ...fixture(),
      appt('zzid-008', 'CANCELLED', P1, 'Servico Heda', {
        professional: PRO_ACTIVE,
        cancelledBy: 'PROFESSIONAL',
        cancellationReason: 'Problema pessoal.',
      }),
    ];
    await searchFixture(rows);
    fireEvent.click(screen.getByRole('tab', { name: /histórico/i }));
    const h = card('Servico Heda');
    expect(h.getByText('Cancelado pelo profissional')).toBeInTheDocument();
    expect(h.getByText('Motivo informado')).toBeInTheDocument();
    expect(h.getByText('Problema pessoal.')).toBeInTheDocument();
    // Cancelado por você (reason null) — nenhum bloco de motivo.
    expect(card('Servico Elba').queryByText('Motivo informado')).toBeNull();
  });

  it('38. stale target: abre A, fecha, abre B — PATCH vai para B', async () => {
    await searchFixture();
    fireEvent.click(card('Servico Ana').getByRole('button', { name: 'Cancelar agendamento' }));
    let d = await dialog();
    fireEvent.click(d.getByRole('button', { name: 'Voltar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    fireEvent.click(card('Servico Bia').getByRole('button', { name: 'Cancelar agendamento' }));
    d = await dialog();
    mockPatch.mockResolvedValue({ data: {} });
    fireEvent.click(d.getByRole('button', { name: 'Cancelar agendamento' }));
    await waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(1));
    expect(mockPatch).toHaveBeenCalledWith('/appointments/zzid-002/cancel-public', {
      phone: PHONE_DIGITS,
    });
  });

  it('39. PATCH 200 + refetch 500 — sucesso reconhecido, sem estado falso, recuperação funciona', async () => {
    mockGet.mockResolvedValueOnce({ data: fixture() });
    mockGet.mockRejectedValueOnce(apiError(500));
    render(<CustomerAppointments />);
    fireEvent.change(screen.getByPlaceholderText(/Telefone com DDD/), { target: { value: PHONE_DIGITS } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar agendamentos' }));
    await screen.findAllByTestId('appointment-card');
    mockPatch.mockResolvedValue({ data: {} });
    fireEvent.click(card('Servico Ana').getByRole('button', { name: 'Cancelar agendamento' }));
    const d = await dialog();
    fireEvent.click(d.getByRole('button', { name: 'Cancelar agendamento' }));
    // Sucesso do cancelamento é reconhecido (toast) mesmo com o refetch falhando.
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Algo deu errado. Tente novamente.'),
    );
    // Sem estado falso: nada é inventado localmente — a lista fica vazia até reconstruir.
    expect(screen.queryByTestId('appointment-card')).toBeNull();
    // Recuperação: nova busca reconstrói a lista pela resposta do backend.
    mockGet.mockResolvedValueOnce({ data: fixture() });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar agendamentos' }));
    await screen.findAllByTestId('appointment-card');
  });
});

// ---------------------------------------------------------------------------
// 4. Integração com a página do Professional (props)
// ---------------------------------------------------------------------------

describe('Uso embutido (página do Professional)', () => {
  it('34. initialPhone + refreshKey disparam a busca automaticamente', async () => {
    mockGet.mockResolvedValue({ data: fixture() });
    render(<CustomerAppointments initialPhone={PHONE_DIGITS} refreshKey={1} bookingConfirmed />);
    await waitFor(() =>
      expect(mockGet).toHaveBeenCalledWith('/appointments/by-phone', {
        params: { phone: PHONE_DIGITS },
      }),
    );
    expect(await screen.findByText('Agendamento realizado com sucesso!')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver meus agendamentos' })).toBeInTheDocument();
  });

  it('35. professionalId é enviado como filtro do filtro escopo', async () => {
    mockGet.mockResolvedValue({ data: fixture() });
    render(<CustomerAppointments professionalId="zzprof-1" />);
    fireEvent.change(screen.getByPlaceholderText(/Telefone com DDD/), { target: { value: PHONE_DIGITS } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar agendamentos' }));
    await screen.findAllByTestId('appointment-card');
    expect(mockGet).toHaveBeenCalledWith('/appointments/by-phone', {
      params: { phone: PHONE_DIGITS, professionalId: 'zzprof-1' },
    });
  });

  it('36. zero native dialogs: window.confirm/alert/prompt nunca usados na área', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue(null);
    await searchFixture();
    mockPatch.mockResolvedValue({ data: {} });
    fireEvent.click(card('Servico Ana').getByRole('button', { name: 'Cancelar agendamento' }));
    const d = await dialog();
    fireEvent.click(d.getByRole('button', { name: 'Cancelar agendamento' }));
    await waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(1));
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
    expect(promptSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
    alertSpy.mockRestore();
    promptSpy.mockRestore();
  });
});

async function renderAndSearch() {
  render(<CustomerAppointments />);
  fireEvent.change(screen.getByPlaceholderText(/Telefone com DDD/), {
    target: { value: PHONE_DIGITS },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Buscar agendamentos' }));
  await waitFor(() => expect(screen.getAllByTestId('appointment-card').length).toBeGreaterThan(0));
}
