"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { format, addMinutes, isAfter } from "date-fns";
import api from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface AppointmentRow {
  id: string;
  date: string;
  status: string;
  cancellationReason?: string | null;
  cancelledBy?: string | null;
  customer?: { name: string; phone: string } | null;
  service?: { name: string; durationMinutes: number; price: number } | null;
  professional?: { name: string; slug?: string; whatsapp?: string | null } | null;
}

interface CustomerAppointmentsProps {
  professionalId?: string;
  initialPhone?: string;
  refreshKey?: number;
  bookingConfirmed?: boolean;
  primaryColor?: string;
  readQueryParams?: boolean;
  onRebook?: () => void;
}

type Tab = "proximos" | "historico";

/* Labels amigáveis PT-BR — o enum cru nunca aparece na UI. */
const STATUS_LABELS: Record<string, string> = {
  PENDING: "Aguardando confirmação",
  CONFIRMED: "Confirmado",
  CANCELLED: "Cancelado",
  COMPLETED: "Concluído",
  NO_SHOW: "Não compareceu",
};

function statusLabel(appt: AppointmentRow): string {
  if (appt.status === "CANCELLED") {
    if (appt.cancelledBy === "CUSTOMER") return "Cancelado por você";
    if (appt.cancelledBy === "PROFESSIONAL") return "Cancelado pelo profissional";
    return "Cancelado";
  }
  return STATUS_LABELS[appt.status] ?? "Status indisponível";
}

/* Mensagens do contrato de cancel-public que podem ser refletidas na UI. */
const ALLOWED_CANCEL_MESSAGES = new Set([
  "Este agendamento não pode mais ser cancelado.",
  "Não é possível cancelar um agendamento que já iniciou.",
  "Agendamento não encontrado.",
  "Agendamento não encontrado para este telefone.",
]);

/* Mensagens do contrato de busca que podem ser refletidas na UI. */
const ALLOWED_SEARCH_MESSAGES = new Set(["Telefone inválido."]);

const FRIENDLY_EMPTY = "Nenhum agendamento encontrado.";
const TOO_MANY_REQUESTS = "Muitas tentativas. Aguarde um momento e tente novamente.";
const SAFE_FALLBACK = "Algo deu errado. Tente novamente.";
const SEARCH_EMPTY_MESSAGE = "Digite um número de WhatsApp para buscar seus agendamentos.";

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

function getAppointmentEnd(appt: AppointmentRow): Date | null {
  if (!appt.service?.durationMinutes) return null;
  const start = new Date(appt.date);
  if (isNaN(start.getTime())) return null;
  return addMinutes(start, appt.service.durationMinutes);
}

function formatAppointmentTime(appt: AppointmentRow): string {
  const start = new Date(appt.date);
  if (isNaN(start.getTime())) {
    return "Data inválida";
  }
  const dateStr = format(start, "dd/MM/yyyy");
  const timeStr = format(start, "HH:mm");
  const end = getAppointmentEnd(appt);
  if (!end) {
    return `${dateStr} às ${timeStr}`;
  }
  return `${dateStr} ${timeStr} - ${format(end, "HH:mm")}`;
}

/* Mesma semântica de timing do backend (date <= now = já ocorreu) —
 * usada APENAS para decidir tab e controles; o backend é a autoridade. */
function hasHappened(appt: AppointmentRow): boolean {
  const d = new Date(appt.date);
  return !isNaN(d.getTime()) && !isAfter(d, new Date());
}

function isTerminal(status: string): boolean {
  return status === "CANCELLED" || status === "COMPLETED" || status === "NO_SHOW";
}

function canCancel(appt: AppointmentRow): boolean {
  return (appt.status === "PENDING" || appt.status === "CONFIRMED") && !hasHappened(appt);
}

function friendlyApiError(err: unknown, allowed: Set<string>, fallback: string): string {
  const e = err as { response?: { status?: number; data?: { message?: string | string[] } } };
  const status = e?.response?.status;
  if (status === 429) return TOO_MANY_REQUESTS;
  const message = e?.response?.data?.message;
  if (typeof message === "string" && allowed.has(message)) return message;
  return fallback;
}

export default function CustomerAppointments({
  professionalId,
  initialPhone,
  refreshKey,
  bookingConfirmed,
  primaryColor,
  readQueryParams,
  onRebook,
}: CustomerAppointmentsProps) {
  const [phone, setPhone] = useState("");
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("proximos");
  const [dialogId, setDialogId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [confirmedFromQuery, setConfirmedFromQuery] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingRef = useRef<Set<string>>(new Set());

  const accent = primaryColor ?? "#111827";

  const fetchAppointments = useCallback(
    async (digits: string) => {
      setLoading(true);
      try {
        const params: { phone: string; professionalId?: string } = { phone: digits };
        if (professionalId) params.professionalId = professionalId;
        const res = await api.get("/appointments/by-phone", { params });
        const rows: AppointmentRow[] = Array.isArray(res.data) ? res.data : [];
        setAppointments(rows);
        setFeedback(rows.length === 0 ? FRIENDLY_EMPTY : null);
      } catch (err) {
        const e = err as { response?: { status?: number } };
        if (e?.response?.status === 404) {
          // Nenhum cliente para este telefone — empty state amigável, não erro crítico.
          setAppointments([]);
          setFeedback(FRIENDLY_EMPTY);
        } else {
          setAppointments([]);
          setFeedback(friendlyApiError(err, ALLOWED_SEARCH_MESSAGES, SAFE_FALLBACK));
        }
      } finally {
        setLoading(false);
        setSearched(true);
      }
    },
    [professionalId],
  );

  // Compatibilidade com o link legado /agendamentos?phone=...&confirmed=1
  useEffect(() => {
    if (!readQueryParams) return;
    const params = new URLSearchParams(window.location.search);
    const qPhone = params.get("phone");
    if (!qPhone) return;
    if (params.get("confirmed") === "1") setConfirmedFromQuery(true);
    setPhone(qPhone);
    void fetchAppointments(normalizePhone(qPhone));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readQueryParams]);

  // Integração com a página do Professional: busca automática pós-agendamento.
  useEffect(() => {
    if (!initialPhone) return;
    setPhone(initialPhone);
    if (refreshKey) void fetchAppointments(normalizePhone(initialPhone));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, initialPhone]);

  const handleSearch = async () => {
    const digits = normalizePhone(phone);
    if (digits.length < 10) {
      setFeedback("Informe um WhatsApp válido.");
      return;
    }
    await fetchAppointments(digits);
  };

  const runCancel = async (appt: AppointmentRow) => {
    if (pendingRef.current.has(appt.id)) return; // double-submit guard
    pendingRef.current.add(appt.id);
    setCancellingId(appt.id);
    const digits = normalizePhone(phone);
    try {
      // Body EXATAMENTE { phone } — reason é exclusivo do fluxo autenticado.
      await api.patch(`/appointments/${appt.id}/cancel-public`, { phone: digits });
      toast.success("Agendamento cancelado.");
      setDialogId(null);
      // Response authority: o card NUNCA é montado a partir da resposta do
      // cancelamento — a view é reconstruída pelo refetch do by-phone.
      await fetchAppointments(digits);
    } catch (err) {
      toast.error(friendlyApiError(err, ALLOWED_CANCEL_MESSAGES, SAFE_FALLBACK));
      // O dialog permanece aberto para permitir retry e a view é
      // ressincronizada com a autoridade do backend.
      await fetchAppointments(digits);
    } finally {
      pendingRef.current.delete(appt.id);
      setCancellingId(null);
    }
  };

  const proximos = appointments
    .filter((a) => (a.status === "PENDING" || a.status === "CONFIRMED") && !hasHappened(a))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const historico = appointments
    .filter((a) => isTerminal(a.status) || hasHappened(a))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const visible = tab === "proximos" ? proximos : historico;
  const dialogAppt = dialogId ? appointments.find((a) => a.id === dialogId) ?? null : null;

  const emptyMessage =
    tab === "proximos" ? "Nenhum próximo agendamento." : "Nenhum agendamento no histórico.";

  return (
    <div className="space-y-4">
      {(bookingConfirmed || confirmedFromQuery) && (
        <div
          className="rounded-lg border p-4"
          style={{
            borderColor: accent,
            backgroundColor: `${accent}10`,
          }}
        >
          <p className="font-medium" style={{ color: accent }}>
            Agendamento realizado com sucesso!
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Busque pelo seu número de WhatsApp para ver seus agendamentos e acompanhar
            confirmações ou cancelamentos.
          </p>
          <Button
            size="sm"
            variant="outline"
            className="mt-3"
            onClick={() => inputRef.current?.focus()}
          >
            Ver meus agendamentos
          </Button>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Meus agendamentos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              ref={inputRef}
              placeholder="Telefone com DDD (ex: 11 99999-0000)"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void handleSearch()}
            />
            <Button
              onClick={() => void handleSearch()}
              disabled={loading || !normalizePhone(phone)}
              className="shrink-0"
            >
              {loading ? "Buscando..." : "Buscar agendamentos"}
            </Button>
          </div>

          {feedback && (
            <p role="status" className="text-sm text-muted-foreground">
              {feedback}
            </p>
          )}

          {searched && (
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Agendamentos">
              <Button
                role="tab"
                variant={tab === "proximos" ? "default" : "outline"}
                size="sm"
                aria-selected={tab === "proximos"}
                onClick={() => setTab("proximos")}
              >
                Próximos
                {proximos.length > 0 && ` (${proximos.length})`}
              </Button>
              <Button
                role="tab"
                variant={tab === "historico" ? "default" : "outline"}
                size="sm"
                aria-selected={tab === "historico"}
                onClick={() => setTab("historico")}
              >
                Histórico
                {historico.length > 0 && ` (${historico.length})`}
              </Button>
            </div>
          )}

          {!searched && !feedback && (
            <p className="text-sm text-muted-foreground">{SEARCH_EMPTY_MESSAGE}</p>
          )}

          {searched && visible.length === 0 && (
            <p className="text-sm text-muted-foreground">{emptyMessage}</p>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            {visible.map((appt) => (
              <div key={appt.id} data-testid="appointment-card" className="rounded-lg border p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      Com {appt.professional?.name ?? "Profissional"}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {appt.service?.name ?? "Serviço"}
                    </p>
                  </div>
                  <Badge variant="outline" className="shrink-0">
                    {statusLabel(appt)}
                  </Badge>
                </div>
                <div className="mt-3 space-y-1 text-sm">
                  <p>
                    🗓️ {formatAppointmentTime(appt)}
                  </p>
                  {appt.service?.durationMinutes && (
                    <p className="text-muted-foreground">
                      ⏱️ {appt.service.durationMinutes} minutos
                    </p>
                  )}
                  {appt.service?.price != null && (
                    <p className="text-muted-foreground">
                      💰 R$ {Number(appt.service.price).toFixed(2).replace(".", ",")}
                    </p>
                  )}
                  {hasHappened(appt) && (appt.status === "PENDING" || appt.status === "CONFIRMED") && (
                    <p className="text-muted-foreground italic">O horário já passou.</p>
                  )}
                  {appt.status === "CANCELLED" && appt.cancelledBy === "PROFESSIONAL" && (
                    <div className="mt-2 rounded-lg border border-red-200 p-3">
                      <p className="text-sm font-semibold text-red-700">Motivo informado</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {appt.cancellationReason ??
                          "O profissional informou que não poderá realizar este atendimento."}
                      </p>
                    </div>
                  )}
                </div>
                {canCancel(appt) && (
                  <Button
                    size="sm"
                    variant="destructive"
                    className="mt-3"
                    disabled={cancellingId === appt.id}
                    onClick={() => setDialogId(appt.id)}
                  >
                    Cancelar agendamento
                  </Button>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <AlertDialog
        open={dialogId !== null}
        onOpenChange={(open) => {
          if (!open) setDialogId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar agendamento?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação só é possível antes do horário agendado e não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={cancellingId !== null}
              onClick={(e) => {
                // Impede o auto-close do Radix: o dialog só fecha no sucesso
                // (setDialogId(null)) — permanece aberto para retry em erro.
                e.preventDefault();
                if (dialogAppt) void runCancel(dialogAppt);
              }}
            >
              {cancellingId ? "Cancelando..." : "Cancelar agendamento"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
