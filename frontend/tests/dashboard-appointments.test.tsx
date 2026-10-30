import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';

const { mockGet, mockPatch, mockDelete, mockToastSuccess, mockToastError } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPatch: vi.fn(),
  mockDelete: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
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

import DashboardPage from '@/app/dashboard/page';

// ---------------------------------------------------------------------------
// Fixtures — datas relativas ao momento real (sem fake timers).
// ---------------------------------------------------------------------------

const DAY = 86_400_000;
const NOW = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();

const F1 = iso(NOW + 3 * DAY); // futuro mais próximo
const F2 = iso(NOW + 5 * DAY); // futuro mais distante
const P1 = iso(NOW - 5 * DAY); // passado mais antigo
const P2 = iso(NOW - 3 * DAY); // passado mais recente

type Row = {
  id: string;
  date: string;
  status: string;
  cancellationReason?: string | null;
  cancelledBy?: string | null;
  cancelledAt?: string | null;
  customer: { id: string; name: string; phone: string };
  service: { id: string; name: string; durationMinutes: number; price: number };
};

function appt(id: string, status: string, date: string, name: string, extra: object = {}): Row {
  return {
    id,
    date,
    status,
    customer: { id: `c-${id}`, name, phone: '11999990000' },
    service: { id: 's1', name: 'Manicure', durationMinutes: 60, price: 50 },
    ...extra,
  };
}

function fixture(): Row[] {
  return [
    appt('a1', 'PENDING', F1, 'Futuro A'),
    appt('a2', 'CONFIRMED', F2, 'Futuro B'),
    appt('a3', 'PENDING', P2, 'Passado B'),
    appt('a4', 'CONFIRMED', P1, 'Passado A'),
    appt('a5', 'CANCELLED', P2, 'Cancelado X', {
      cancellationReason: 'motivo teste',
      cancelledBy: 'PROFESSIONAL',
    }),
    appt('a6', 'COMPLETED', P1, 'Concluído Y'),
    appt('a7', 'NO_SHOW', P2, 'Ausente Z'),
  ];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function renderPage(rows: Row[] = fixture()) {
  mockGet.mockResolvedValue({ data: rows });
  render(<DashboardPage />);
  await screen.findByRole('tab', { name: /próximos/i });
}

function goHistorico() {
  fireEvent.click(screen.getByRole('tab', { name: /histórico/i }));
}

function goProximos() {
  fireEvent.click(screen.getByRole('tab', { name: /próximos/i }));
}

function setFilter(value: string) {
  fireEvent.change(screen.getByLabelText('Filtrar por status'), { target: { value } });
}

function card(name: string) {
  return within(screen.getByText(name).closest('[data-slot="card"]') as HTMLElement);
}

function cardNames() {
  return [...document.querySelectorAll('[data-slot="card-title"]')].map((el) => el.textContent);
}

async function dialog() {
  return within(await screen.findByRole('alertdialog'));
}

function clickButton(scope: HTMLElement | ReturnType<typeof within>, name: string | RegExp) {
  fireEvent.click(scope.getByRole('button', { name }));
}

// Erro fiel ao shape consumido pelo código: err.response.status / err.response.data.message.
function apiError(status: number, message?: string | string[]) {
  return { response: { status, data: message === undefined ? {} : { message } } };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// 1. Tabs e posicionamento
// ---------------------------------------------------------------------------

describe('Tabs Próximos / Histórico', () => {
  it('1. tab padrão é Próximos, apenas PENDING/CONFIRMED futuros, mais próximo primeiro', async () => {
    await renderPage();
    expect(screen.getByRole('tab', { name: /próximos/i })).toHaveAttribute('aria-selected', 'true');
    expect(cardNames()).toEqual(['Futuro A', 'Futuro B']);
  });

  it('2. Histórico traz terminais + passados, mais recente primeiro (ordem estável)', async () => {
    await renderPage();
    goHistorico();
    expect(cardNames()).toEqual(['Passado B', 'Cancelado X', 'Ausente Z', 'Passado A', 'Concluído Y']);
  });

  it('3. PENDING passado fica no Histórico e mantém o botão Confirmar (sem Cancelar/Excluir)', async () => {
    await renderPage();
    goHistorico();
    const c = card('Passado B');
    expect(c.getByRole('button', { name: /confirmar/i })).toBeInTheDocument();
    expect(c.queryByRole('button', { name: /cancelar/i })).toBeNull();
    expect(c.queryByRole('button', { name: /excluir/i })).toBeNull();
  });

  it('4. CONFIRMED passado fica no Histórico com Concluir + Não compareceu (sem Cancelar/Excluir)', async () => {
    await renderPage();
    goHistorico();
    const c = card('Passado A');
    expect(c.getByRole('button', { name: /concluir/i })).toBeInTheDocument();
    expect(c.getByRole('button', { name: /não compareceu/i })).toBeInTheDocument();
    expect(c.queryByRole('button', { name: /cancelar/i })).toBeNull();
    expect(c.queryByRole('button', { name: /excluir/i })).toBeNull();
  });

  it('5. CANCELLED mostra apenas Excluir e o motivo gravado; sem Cancelar', async () => {
    await renderPage();
    goHistorico();
    const c = card('Cancelado X');
    expect(c.getByText('motivo teste')).toBeInTheDocument();
    expect(c.getByRole('button', { name: /excluir agendamento/i })).toBeInTheDocument();
    expect(c.queryByRole('button', { name: /cancelar/i })).toBeNull();
  });

  it('6. COMPLETED mostra apenas Excluir', async () => {
    await renderPage();
    goHistorico();
    const c = card('Concluído Y');
    expect(c.getByRole('button', { name: /excluir agendamento/i })).toBeInTheDocument();
    expect(c.queryByRole('button', { name: /cancelar/i })).toBeNull();
  });

  it('7. NO_SHOW mostra apenas Excluir', async () => {
    await renderPage();
    goHistorico();
    const c = card('Ausente Z');
    expect(c.getByRole('button', { name: /excluir agendamento/i })).toBeInTheDocument();
    expect(c.queryByRole('button', { name: /cancelar/i })).toBeNull();
  });

  it('8. PENDING futuro tem Confirmar + Cancelar e não tem Excluir', async () => {
    await renderPage();
    const c = card('Futuro A');
    expect(c.getByRole('button', { name: /confirmar/i })).toBeInTheDocument();
    expect(c.getByRole('button', { name: /cancelar/i })).toBeInTheDocument();
    expect(c.queryByRole('button', { name: /excluir/i })).toBeNull();
  });

  it('9. CONFIRMED futuro tem apenas Cancelar (sem Concluir/Não compareceu/Excluir)', async () => {
    await renderPage();
    const c = card('Futuro B');
    expect(c.getByRole('button', { name: /cancelar/i })).toBeInTheDocument();
    expect(c.queryByRole('button', { name: /concluir/i })).toBeNull();
    expect(c.queryByRole('button', { name: /não compareceu/i })).toBeNull();
    expect(c.queryByRole('button', { name: /excluir/i })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2. Confirmar — ação direta, sem diálogo
// ---------------------------------------------------------------------------

describe('Confirmar (ação direta)', () => {
  it('10. chama PATCH com body contendo apenas status (sem reason)', async () => {
    await renderPage();
    mockPatch.mockResolvedValue({ data: { ...fixture()[0], status: 'CONFIRMED' } });
    clickButton(card('Futuro A'), /confirmar/i);
    await waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(1));
    expect(mockPatch).toHaveBeenCalledWith('/appointments/a1/status', { status: 'CONFIRMED' });
  });

  it('11. durante o request mostra loading e NÃO faz optimistic update', async () => {
    await renderPage();
    mockPatch.mockReturnValue(new Promise(() => {})); // nunca resolve
    clickButton(card('Futuro A'), /confirmar/i);
    expect(card('Futuro A').getByText('Atualizando...')).toBeInTheDocument();
    expect(card('Futuro A').getByText('Pendente')).toBeInTheDocument();
    expect(mockToastSuccess).not.toHaveBeenCalled();
  });

  it('12. double click dispara um único PATCH', async () => {
    await renderPage();
    mockPatch.mockReturnValue(new Promise(() => {}));
    const btn = card('Futuro A').getByRole('button', { name: /confirmar/i });
    fireEvent.click(btn);
    fireEvent.click(btn);
    await new Promise((r) => setTimeout(r, 0));
    expect(mockPatch).toHaveBeenCalledTimes(1);
  });

  it('13. response do backend é a autoridade: badge atualiza com response.data + toast', async () => {
    await renderPage();
    mockPatch.mockResolvedValue({ data: { ...fixture()[0], status: 'CONFIRMED' } });
    clickButton(card('Futuro A'), /confirmar/i);
    await card('Futuro A').findByText('Confirmado');
    expect(mockToastSuccess).toHaveBeenCalledWith('Agendamento confirmado.');
  });
});

// ---------------------------------------------------------------------------
// 3. Cancelar — AlertDialog com motivo obrigatório
// ---------------------------------------------------------------------------

describe('Cancelar com motivo (AlertDialog)', () => {
  it('14. abrir o diálogo não dispara PATCH', async () => {
    await renderPage();
    clickButton(card('Futuro A'), /cancelar/i);
    await dialog();
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it('15. confirmação desabilitada sem motivo', async () => {
    await renderPage();
    clickButton(card('Futuro A'), /cancelar/i);
    const d = await dialog();
    expect(d.getByRole('button', { name: /cancelar agendamento/i })).toBeDisabled();
  });

  it('16. motivo somente com espaços não habilita a confirmação', async () => {
    await renderPage();
    clickButton(card('Futuro A'), /cancelar/i);
    const d = await dialog();
    fireEvent.change(d.getByLabelText('Motivo'), { target: { value: '   ' } });
    expect(d.getByRole('button', { name: /cancelar agendamento/i })).toBeDisabled();
  });

  it('17. Voltar fecha o diálogo sem disparar PATCH', async () => {
    await renderPage();
    clickButton(card('Futuro A'), /cancelar/i);
    const d = await dialog();
    fireEvent.click(d.getByRole('button', { name: /voltar/i }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it('18. envia PATCH com motivo aparado (trim)', async () => {
    await renderPage();
    mockPatch.mockResolvedValue({ data: { ...fixture()[0], status: 'CANCELLED' } });
    clickButton(card('Futuro A'), /cancelar/i);
    const d = await dialog();
    fireEvent.change(d.getByLabelText('Motivo'), { target: { value: '  motivo  ' } });
    fireEvent.click(d.getByRole('button', { name: /cancelar agendamento/i }));
    await waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(1));
    expect(mockPatch).toHaveBeenCalledWith('/appointments/a1/status', {
      status: 'CANCELLED',
      reason: 'motivo',
    });
  });

  it('19. durante o request mostra loading (Salvando...) e mantém o diálogo aberto', async () => {
    await renderPage();
    mockPatch.mockReturnValue(new Promise(() => {}));
    clickButton(card('Futuro A'), /cancelar/i);
    const d = await dialog();
    fireEvent.change(d.getByLabelText('Motivo'), { target: { value: 'motivo real' } });
    fireEvent.click(d.getByRole('button', { name: /cancelar agendamento/i }));
    expect(d.getByRole('button', { name: /salvando/i })).toBeDisabled();
  });

  it('20. double submit dispara um único PATCH', async () => {
    await renderPage();
    mockPatch.mockReturnValue(new Promise(() => {}));
    clickButton(card('Futuro A'), /cancelar/i);
    const d = await dialog();
    fireEvent.change(d.getByLabelText('Motivo'), { target: { value: 'motivo real' } });
    const btn = d.getByRole('button', { name: /cancelar agendamento/i });
    fireEvent.click(btn);
    fireEvent.click(btn);
    await new Promise((r) => setTimeout(r, 0));
    expect(mockPatch).toHaveBeenCalledTimes(1);
  });

  it('21. sucesso fecha o diálogo, mostra toast e item sai de Próximos (response autoridade)', async () => {
    await renderPage();
    mockPatch.mockResolvedValue({
      data: { ...fixture()[0], status: 'CANCELLED', cancellationReason: 'ok', cancelledBy: 'PROFESSIONAL' },
    });
    clickButton(card('Futuro A'), /cancelar/i);
    const d = await dialog();
    fireEvent.change(d.getByLabelText('Motivo'), { target: { value: 'motivo real' } });
    fireEvent.click(d.getByRole('button', { name: /cancelar agendamento/i }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(mockToastSuccess).toHaveBeenCalledWith('Agendamento cancelado.');
    expect(screen.queryByText('Futuro A')).toBeNull(); // migrou para o Histórico
    goHistorico();
    await card('Futuro A').findByText('Cancelado');
  });

  it('22. CONFIRMED futuro também oferece Cancelar e abre o diálogo', async () => {
    await renderPage();
    clickButton(card('Futuro B'), /cancelar/i);
    await dialog();
    expect(mockPatch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 4. Concluir — AlertDialog
// ---------------------------------------------------------------------------

describe('Concluir (AlertDialog)', () => {
  it('23. abrir o diálogo não dispara PATCH', async () => {
    await renderPage();
    goHistorico();
    clickButton(card('Passado A'), /concluir/i);
    await dialog();
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it('24. Voltar fecha sem disparar PATCH', async () => {
    await renderPage();
    goHistorico();
    clickButton(card('Passado A'), /concluir/i);
    const d = await dialog();
    fireEvent.click(d.getByRole('button', { name: /voltar/i }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it('25. confirmar envia PATCH {status: COMPLETED}, badge usa response.data e toast aparece', async () => {
    await renderPage();
    goHistorico();
    mockPatch.mockResolvedValue({ data: { ...fixture()[3], status: 'COMPLETED' } });
    clickButton(card('Passado A'), /concluir/i);
    const d = await dialog();
    fireEvent.click(d.getByRole('button', { name: /concluir/i }));
    await waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(1));
    expect(mockPatch).toHaveBeenCalledWith('/appointments/a4/status', { status: 'COMPLETED' });
    const c = card('Passado A');
    await c.findByText('Concluído');
    expect(mockToastSuccess).toHaveBeenCalledWith('Agendamento concluído.');
    // Pós-transição: sem ações de status, apenas Excluir.
    expect(c.queryByRole('button', { name: /não compareceu/i })).toBeNull();
    expect(c.getByRole('button', { name: /excluir agendamento/i })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 5. Não compareceu — AlertDialog
// ---------------------------------------------------------------------------

describe('Não compareceu (AlertDialog)', () => {
  it('26. abrir o diálogo não dispara PATCH', async () => {
    await renderPage();
    goHistorico();
    clickButton(card('Passado A'), /não compareceu/i);
    await dialog();
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it('27. Voltar fecha sem disparar PATCH', async () => {
    await renderPage();
    goHistorico();
    clickButton(card('Passado A'), /não compareceu/i);
    const d = await dialog();
    fireEvent.click(d.getByRole('button', { name: /voltar/i }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it('28. confirmar envia PATCH {status: NO_SHOW}, badge usa response.data e toast aparece', async () => {
    await renderPage();
    goHistorico();
    mockPatch.mockResolvedValue({ data: { ...fixture()[3], status: 'NO_SHOW' } });
    clickButton(card('Passado A'), /não compareceu/i);
    const d = await dialog();
    fireEvent.click(d.getByRole('button', { name: /não compareceu/i }));
    await waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(1));
    expect(mockPatch).toHaveBeenCalledWith('/appointments/a4/status', { status: 'NO_SHOW' });
    const c = card('Passado A');
    await c.findByText('Não compareceu');
    expect(mockToastSuccess).toHaveBeenCalledWith('Cliente marcado como não compareceu.');
    // Pós-transição: sem ações de status, apenas Excluir.
    expect(c.queryByRole('button', { name: /concluir/i })).toBeNull();
    expect(c.getByRole('button', { name: /excluir agendamento/i })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 6. Excluir — AlertDialog
// ---------------------------------------------------------------------------

describe('Excluir finalizado (AlertDialog)', () => {
  it('29. abrir o diálogo não dispara DELETE', async () => {
    await renderPage();
    goHistorico();
    clickButton(card('Concluído Y'), /excluir agendamento/i);
    await dialog();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('30. Voltar fecha sem disparar DELETE', async () => {
    await renderPage();
    goHistorico();
    clickButton(card('Concluído Y'), /excluir agendamento/i);
    const d = await dialog();
    fireEvent.click(d.getByRole('button', { name: /voltar/i }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('31. confirmar chama DELETE /appointments/:id, remove o card e mostra toast', async () => {
    await renderPage();
    goHistorico();
    mockDelete.mockResolvedValue({ data: undefined });
    clickButton(card('Concluído Y'), /excluir agendamento/i);
    const d = await dialog();
    fireEvent.click(d.getByRole('button', { name: /^excluir$/i }));
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('/appointments/a6'));
    await waitFor(() => expect(screen.queryByText('Concluído Y')).toBeNull());
    expect(mockToastSuccess).toHaveBeenCalledWith('Agendamento excluído.');
  });
});

// ---------------------------------------------------------------------------
// 7. Limpar finalizados — AlertDialog
// ---------------------------------------------------------------------------

describe('Limpar finalizados (AlertDialog)', () => {
  it('32. botão aparece no Histórico e abrir o diálogo não dispara DELETE', async () => {
    await renderPage();
    goHistorico();
    clickButton(screen, /limpar finalizados/i);
    await dialog();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('33. confirmar chama DELETE /appointments/cleanup e remove apenas os deletedIds', async () => {
    await renderPage();
    goHistorico();
    mockDelete.mockResolvedValue({ data: { count: 3, deletedIds: ['a5', 'a6', 'a7'], message: 'ok' } });
    clickButton(screen, /limpar finalizados/i);
    const d = await dialog();
    fireEvent.click(d.getByRole('button', { name: /limpar finalizados/i }));
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('/appointments/cleanup'));
    await waitFor(() => expect(cardNames()).toEqual(['Passado B', 'Passado A']));
    expect(mockToastSuccess).toHaveBeenCalledWith('3 agendamentos removidos.');
  });

  it('34. botão fica desabilitado quando não há finalizados', async () => {
    await renderPage([fixture()[0], fixture()[1]]);
    goHistorico();
    expect(screen.getByRole('button', { name: /limpar finalizados/i })).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// 8. Tratamento de erros
// ---------------------------------------------------------------------------

describe('Erros', () => {
  it('35. 400 com mensagem permitida (timing) mostra a mensagem exata e item permanece', async () => {
    await renderPage();
    mockPatch.mockRejectedValue(apiError(400, 'O horário agendado ainda não ocorreu.'));
    clickButton(card('Futuro A'), /confirmar/i);
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('O horário agendado ainda não ocorreu.'));
    expect(card('Futuro A').getByText('Pendente')).toBeInTheDocument();
  });

  it('36. 400 com mensagem permitida (transição) mostra a mensagem exata', async () => {
    await renderPage();
    mockPatch.mockRejectedValue(apiError(400, 'Esta alteração de status não é permitida.'));
    clickButton(card('Futuro A'), /confirmar/i);
    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith('Esta alteração de status não é permitida.'),
    );
  });

  it('37. 404 mostra toast com mensagem permitida e refaz a listagem', async () => {
    await renderPage();
    mockPatch.mockRejectedValue(apiError(404, 'Agendamento não encontrado.'));
    clickButton(card('Futuro A'), /confirmar/i);
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Agendamento não encontrado.'));
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
  });

  it('38. 409 mostra toast com mensagem permitida e refaz a listagem', async () => {
    await renderPage();
    mockPatch.mockRejectedValue(
      apiError(409, 'O agendamento foi alterado por outra operação. Atualize e tente novamente.'),
    );
    clickButton(card('Futuro A'), /confirmar/i);
    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith(
        'O agendamento foi alterado por outra operação. Atualize e tente novamente.',
      ),
    );
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
  });

  it('39. 403 mostra mensagem segura, não faz logout local e não refaz a listagem', async () => {
    localStorage.setItem('token', 'xyz');
    await renderPage();
    mockPatch.mockRejectedValue(apiError(403, 'Qualquer mensagem que não está na lista.'));
    clickButton(card('Futuro A'), /confirmar/i);
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Acesso negado para esta área.'));
    expect(localStorage.getItem('token')).toBe('xyz');
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('40. 5xx com mensagem desconhecida usa fallback seguro e item permanece', async () => {
    await renderPage();
    mockPatch.mockRejectedValue(apiError(500, 'Erro interno inesperado do Prisma'));
    clickButton(card('Futuro A'), /confirmar/i);
    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith(
        'Não foi possível atualizar o agendamento. Tente novamente.',
      ),
    );
    expect(card('Futuro A').getByText('Pendente')).toBeInTheDocument();
  });

  it('41. erro de rede (sem response) usa fallback seguro e item permanece', async () => {
    await renderPage();
    mockPatch.mockRejectedValue(new Error('Network Error'));
    clickButton(card('Futuro A'), /confirmar/i);
    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith(
        'Não foi possível atualizar o agendamento. Tente novamente.',
      ),
    );
    expect(card('Futuro A').getByText('Pendente')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 9. Filtros de status (por tab)
// ---------------------------------------------------------------------------

describe('Filtros de status', () => {
  it('42. filtro padrão Todos mostra tudo da tab Próximos', async () => {
    await renderPage();
    expect(cardNames()).toEqual(['Futuro A', 'Futuro B']);
  });

  it('43. filtro Pendente na tab Próximos mostra apenas Futuro A', async () => {
    await renderPage();
    setFilter('PENDING');
    expect(cardNames()).toEqual(['Futuro A']);
  });

  it('44. filtro Confirmado na tab Próximos mostra apenas Futuro B', async () => {
    await renderPage();
    setFilter('CONFIRMED');
    expect(cardNames()).toEqual(['Futuro B']);
  });

  it('45. filtro respeita a tab: Pendente no Histórico mostra apenas Passado B', async () => {
    await renderPage();
    goHistorico();
    setFilter('PENDING');
    expect(cardNames()).toEqual(['Passado B']);
  });

  it('46. filtro Cancelado no Histórico mostra apenas Cancelado X', async () => {
    await renderPage();
    goHistorico();
    setFilter('CANCELLED');
    expect(cardNames()).toEqual(['Cancelado X']);
  });

  it('47. filtro Concluído no Histórico mostra apenas Concluído Y', async () => {
    await renderPage();
    goHistorico();
    setFilter('COMPLETED');
    expect(cardNames()).toEqual(['Concluído Y']);
  });

  it('48. filtro Não compareceu no Histórico mostra apenas Ausente Z', async () => {
    await renderPage();
    goHistorico();
    setFilter('NO_SHOW');
    expect(cardNames()).toEqual(['Ausente Z']);
  });

  it('49. filtro sem correspondência na tab mostra mensagem própria', async () => {
    await renderPage();
    setFilter('CANCELLED');
    expect(screen.getByText('Nenhum agendamento para este filtro.')).toBeInTheDocument();
  });

  it('50. trocar para Todos restaura a lista completa da tab', async () => {
    await renderPage();
    goHistorico();
    setFilter('CANCELLED');
    setFilter('ALL');
    expect(cardNames()).toEqual(['Passado B', 'Cancelado X', 'Ausente Z', 'Passado A', 'Concluído Y']);
    goProximos();
    expect(cardNames()).toEqual(['Futuro A', 'Futuro B']);
  });
});

// ---------------------------------------------------------------------------
// 10. Estados vazios
// ---------------------------------------------------------------------------

describe('Estados vazios', () => {
  it('51. Próximos vazio mostra a mensagem própria', async () => {
    await renderPage([fixture()[4], fixture()[5]]);
    expect(screen.getByText('Nenhum próximo agendamento.')).toBeInTheDocument();
  });

  it('52. Histórico vazio mostra a mensagem própria', async () => {
    await renderPage([fixture()[0], fixture()[1]]);
    goHistorico();
    expect(screen.getByText('Nenhum agendamento no histórico.')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 11. Regressão (comportamento pré-existente)
// ---------------------------------------------------------------------------

describe('Regressão', () => {
  it('53. GET /appointments é chamado ao carregar', async () => {
    await renderPage();
    expect(mockGet).toHaveBeenCalledWith('/appointments');
  });

  it('54. badge do header mostra o total de agendamentos', async () => {
    await renderPage();
    expect(screen.getByText('7 agendamentos')).toBeInTheDocument();
  });

  it('55. cards de resumo mostram 2 pendentes, 2 confirmados e 3 finalizados', async () => {
    await renderPage();
    expect((screen.getByText('Aguardando confirmação').parentElement as HTMLElement).textContent).toBe(
      'Aguardando confirmação2',
    );
    expect((screen.getByText('Confirmados').parentElement as HTMLElement).textContent).toBe('Confirmados2');
    expect((screen.getByText('Finalizados').parentElement as HTMLElement).textContent).toBe('Finalizados3');
  });

  it('56. botão Atualizar refaz a listagem', async () => {
    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: /atualizar/i }));
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
  });
});

// ---------------------------------------------------------------------------
// 12. Reforços do quality review
// ---------------------------------------------------------------------------

describe('Reforços do quality review', () => {
  it('57. anti-optimistic completo: UI usa response.data mesmo quando difere do status pedido', async () => {
    await renderPage();
    // Backend responde COMPLETED embora o pedido tenha sido CONFIRMED.
    mockPatch.mockResolvedValue({ data: { ...fixture()[0], status: 'COMPLETED' } });
    clickButton(card('Futuro A'), /confirmar/i);
    await waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(1));
    // COMPLETED é terminal — o item deve aparecer no Histórico com o badge do backend.
    goHistorico();
    await card('Futuro A').findByText('Concluído');
  });

  it('58. motivo do cancelamento não vaza entre appointments (abrir A, digitar, fechar, abrir B)', async () => {
    await renderPage();
    clickButton(card('Futuro A'), /cancelar/i);
    const d1 = await dialog();
    fireEvent.change(d1.getByLabelText('Motivo'), { target: { value: 'motivo de A' } });
    fireEvent.click(d1.getByRole('button', { name: /voltar/i }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    clickButton(card('Futuro B'), /cancelar/i);
    const d2 = await dialog();
    expect(d2.getByLabelText('Motivo')).toHaveValue('');
  });

  it('59. guard libera após erro: retry com novo clique funciona', async () => {
    await renderPage();
    mockPatch
      .mockRejectedValueOnce(apiError(500, 'boom'))
      .mockResolvedValue({ data: { ...fixture()[0], status: 'CONFIRMED' } });
    clickButton(card('Futuro A'), /confirmar/i);
    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith(
        'Não foi possível atualizar o agendamento. Tente novamente.',
      ),
    );
    clickButton(card('Futuro A'), /confirmar/i);
    await waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(2));
    expect(mockToastSuccess).toHaveBeenCalledWith('Agendamento confirmado.');
  });

  it('60. PENDING passado confirmado permanece no Histórico oferecendo Concluir + Não compareceu', async () => {
    await renderPage();
    goHistorico();
    mockPatch.mockResolvedValue({ data: { ...fixture()[2], status: 'CONFIRMED' } });
    clickButton(card('Passado B'), /confirmar/i);
    await waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(1));
    const c = card('Passado B');
    await c.findByText('Confirmado');
    expect(c.getByRole('button', { name: /concluir/i })).toBeInTheDocument();
    expect(c.getByRole('button', { name: /não compareceu/i })).toBeInTheDocument();
  });

  it('61. filtro pós-transição: item sai do filtro sem refetch e empty state aparece', async () => {
    await renderPage([fixture()[0], fixture()[1]]);
    setFilter('PENDING');
    expect(cardNames()).toEqual(['Futuro A']);
    mockPatch.mockResolvedValue({ data: { ...fixture()[0], status: 'CONFIRMED' } });
    clickButton(card('Futuro A'), /confirmar/i);
    await waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(1));
    await screen.findByText('Nenhum agendamento para este filtro.');
    expect(mockGet).toHaveBeenCalledTimes(1); // sem refetch — derivação correta
  });

  it('62. erro no DELETE não remove o item localmente', async () => {
    await renderPage();
    goHistorico();
    mockDelete.mockRejectedValue(apiError(500, 'boom'));
    clickButton(card('Concluído Y'), /excluir agendamento/i);
    const d = await dialog();
    fireEvent.click(d.getByRole('button', { name: /^excluir$/i }));
    await waitFor(() => expect(mockDelete).toHaveBeenCalledTimes(1));
    expect(screen.getByText('Concluído Y')).toBeInTheDocument();
    expect(mockToastError).toHaveBeenCalledWith(
      'Não foi possível excluir o agendamento. Tente novamente.',
    );
    expect(mockToastSuccess).not.toHaveBeenCalled();
  });
});
