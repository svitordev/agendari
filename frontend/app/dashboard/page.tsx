"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { format, isValid } from "date-fns";

import { toast } from "sonner";

import {
  CalendarClock,
  Check,
  CheckCircle2,
  History,
  RefreshCw,
  Trash2,
  UserX,
  X,
} from "lucide-react";

import api from "@/lib/api";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { Badge } from "@/components/ui/badge";

import { Button } from "@/components/ui/button";

import { Label } from "@/components/ui/label";

import { Textarea } from "@/components/ui/textarea";

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

type AppointmentStatus =
  | "PENDING"
  | "CONFIRMED"
  | "CANCELLED"
  | "COMPLETED"
  | "NO_SHOW";

type Appointment = {
  id: string;
  date: string;
  status: AppointmentStatus;

  cancellationReason?: string | null;
  cancelledBy?: "PROFESSIONAL" | "CUSTOMER" | null;
  cancelledAt?: string | null;

  customer?: {
    id: string;
    name: string;
    phone: string;
  };

  service?: {
    id: string;
    name: string;
    durationMinutes: number;
    price: number;
  };

  professional?: {
    id: string;
    name: string;
  };
};

type CleanupResponse = {
  count?: number;
  deletedIds?: string[];
  message?: string;
};

type Tab = "proximos" | "historico";

type StatusFilter = "ALL" | AppointmentStatus;

type ActionDialogType = "COMPLETED" | "NO_SHOW" | "DELETE" | "CLEANUP";

type ActionDialog = { type: ActionDialogType; appointment?: Appointment };

const statusConfig = {
  PENDING: {
    label: "Pendente",
    variant: "secondary" as const,
  },

  CONFIRMED: {
    label: "Confirmado",
    variant: "default" as const,
  },

  CANCELLED: {
    label: "Cancelado",
    variant: "destructive" as const,
  },

  COMPLETED: {
    label: "Concluído",
    variant: "outline" as const,
  },

  NO_SHOW: {
    label: "Não compareceu",
    variant: "outline" as const,
  },
};

const FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "ALL", label: "Todos" },
  { value: "PENDING", label: "Pendente" },
  { value: "CONFIRMED", label: "Confirmado" },
  { value: "CANCELLED", label: "Cancelado" },
  { value: "COMPLETED", label: "Concluído" },
  { value: "NO_SHOW", label: "Não compareceu" },
];

const ACTION_DIALOG_CONTENT: Record<
  ActionDialogType,
  { title: string; description: string; action: string; destructive: boolean }
> = {
  COMPLETED: {
    title: "Concluir agendamento?",
    description: "Confirma que o atendimento foi realizado?",
    action: "Concluir",
    destructive: false,
  },

  NO_SHOW: {
    title: "Marcar como não compareceu?",
    description: "O cliente será marcado como ausente neste atendimento.",
    action: "Não compareceu",
    destructive: false,
  },

  DELETE: {
    title: "Excluir agendamento?",
    description:
      "O agendamento será removido definitivamente da sua lista. Esta ação não pode ser desfeita.",
    action: "Excluir",
    destructive: true,
  },

  CLEANUP: {
    title: "Limpar finalizados?",
    description:
      "Todos os agendamentos cancelados, concluídos ou marcados como não compareceu serão removidos. Pendentes e confirmados serão preservados.",
    action: "Limpar finalizados",
    destructive: true,
  },
};

/*
 * Mensagens que o backend desta feature pode devolver (contrato conhecido).
 * Qualquer outra mensagem não é refletida na UI — usa fallback seguro.
 */
const ALLOWED_ERROR_MESSAGES = new Set([
  "Esta alteração de status não é permitida.",
  "O horário agendado ainda não ocorreu.",
  "Não é possível cancelar um agendamento que já iniciou.",
  "Informe o motivo do cancelamento.",
  "Agendamento não encontrado.",
  "O agendamento foi alterado por outra operação. Atualize e tente novamente.",
]);

const FALLBACK_UPDATE_ERROR =
  "Não foi possível atualizar o agendamento. Tente novamente.";

const FALLBACK_DELETE_ERROR =
  "Não foi possível excluir o agendamento. Tente novamente.";

const FALLBACK_CLEANUP_ERROR =
  "Não foi possível limpar os agendamentos. Tente novamente.";

function formatWhatsApp(phone: string) {
  const clean = phone.replace(/\D/g, "");

  const normalized = clean.startsWith("55") ? clean : `55${clean}`;

  return `https://wa.me/${normalized}`;
}

/*
 * Timing apenas para DECIDIR QUAIS CONTROLES MOSTRAR — o backend continua
 * sendo a autoridade final. `date <= now` conta como horário já ocorrido
 * (mesma semântica do backend).
 */
function hasHappened(date: string) {
  const value = new Date(date);

  if (!isValid(value)) {
    return false;
  }

  return value.getTime() <= Date.now();
}

function isFinishedStatus(status: AppointmentStatus) {
  return (
    status === "CANCELLED" || status === "COMPLETED" || status === "NO_SHOW"
  );
}

function getSafeErrorMessage(error: any, fallback: string) {
  const status = error?.response?.status;

  const message = error?.response?.data?.message;

  const text = Array.isArray(message) ? message.join(" ") : message;

  if (typeof text === "string" && ALLOWED_ERROR_MESSAGES.has(text)) {
    return text;
  }

  if (status === 403) {
    return "Acesso negado para esta área.";
  }

  return fallback;
}

export default function DashboardPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);

  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<Tab>("proximos");

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");

  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [cleaning, setCleaning] = useState(false);

  /*
   * Guard síncrono contra double submit no mesmo tick (dois cliques rápidos
   * antes do state React refletir). Key: id do appointment ou "cleanup".
   */
  const pendingActionsRef = useRef<Set<string>>(new Set());

  /*
   * Diálogo de ação com confirmação (Concluir / Não compareceu / Excluir /
   * Limpar). Target explícito — nunca compartilhado entre appointments.
   */
  const [actionDialog, setActionDialog] = useState<ActionDialog | null>(null);

  /*
   * Cancelamento com motivo (diálogo React controlado — sem prompt nativo).
   */
  const [cancellationTarget, setCancellationTarget] =
    useState<Appointment | null>(null);

  const [cancellationReason, setCancellationReason] = useState("");

  const [cancelling, setCancelling] = useState(false);

  /*
   * ========================================================
   * LISTAS (tabs)
   * ========================================================
   */

  /*
   * PRÓXIMOS: PENDING/CONFIRMED com horário futuro — mais próximo primeiro.
   */
  const upcomingAppointments = useMemo(() => {
    return appointments
      .filter(
        (appointment) =>
          (appointment.status === "PENDING" ||
            appointment.status === "CONFIRMED") &&
          !hasHappened(appointment.date),
      )
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [appointments]);

  /*
   * HISTÓRICO: terminais + PENDING/CONFIRMED passados — mais recente
   * primeiro. PENDING/CONFIRMED passados ainda mostram as ações permitidas
   * pela matriz (Histórico não significa "somente terminal").
   */
  const historyAppointments = useMemo(() => {
    return appointments
      .filter(
        (appointment) =>
          isFinishedStatus(appointment.status) ||
          ((appointment.status === "PENDING" ||
            appointment.status === "CONFIRMED") &&
            hasHappened(appointment.date)),
      )
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [appointments]);

  const tabAppointments =
    activeTab === "proximos" ? upcomingAppointments : historyAppointments;

  const visibleAppointments = useMemo(() => {
    if (statusFilter === "ALL") {
      return tabAppointments;
    }

    return tabAppointments.filter(
      (appointment) => appointment.status === statusFilter,
    );
  }, [tabAppointments, statusFilter]);

  const pendingCount = appointments.filter(
    (appointment) => appointment.status === "PENDING",
  ).length;

  const confirmedCount = appointments.filter(
    (appointment) => appointment.status === "CONFIRMED",
  ).length;

  const finishedCount = appointments.filter((appointment) =>
    isFinishedStatus(appointment.status),
  ).length;

  /*
   * ========================================================
   * LOAD
   * ========================================================
   */

  const fetchAppointments = useCallback(async () => {
    try {
      const response = await api.get<Appointment[]>("/appointments");

      setAppointments(response.data ?? []);
    } catch (error) {
      console.error("Erro ao buscar agendamentos:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments]);

  /*
   * ========================================================
   * DATA / HORÁRIO
   * ========================================================
   */

  const getAppointmentTime = (appointment: Appointment) => {
    const start = new Date(appointment.date);

    if (!isValid(start)) {
      return "Data inválida";
    }

    const duration = appointment.service?.durationMinutes ?? 0;

    const end = new Date(start.getTime() + duration * 60 * 1000);

    return `${format(start, "dd/MM/yyyy HH:mm")} - ${format(end, "HH:mm")}`;
  };

  /*
   * ========================================================
   * ERROS (401/suspended/archived pertencem ao interceptor — não duplicar)
   * ========================================================
   */

  const handleActionError = useCallback(
    (error: any, fallback: string) => {
      const status = error?.response?.status;

      // 401 é tratado centralmente pelo interceptor (logout/redirect).
      if (status === 401) {
        return;
      }

      toast.error(getSafeErrorMessage(error, fallback));

      // Stale/sumiço: backend é a autoridade — refaz a leitura da lista.
      if (status === 404 || status === 409) {
        void fetchAppointments();
      }
    },
    [fetchAppointments],
  );

  /*
   * ========================================================
   * AÇÕES DE STATUS (response do backend é a autoridade — sem optimistic)
   * ========================================================
   */

  const runStatusAction = async (
    appointment: Appointment,
    status: AppointmentStatus,
    successMessage: string,
    reason?: string,
  ) => {
    if (pendingActionsRef.current.has(appointment.id)) {
      return;
    }

    pendingActionsRef.current.add(appointment.id);

    setUpdatingId(appointment.id);

    try {
      const body: { status: AppointmentStatus; reason?: string } = { status };

      if (reason) {
        body.reason = reason;
      }

      const response = await api.patch<Appointment>(
        `/appointments/${appointment.id}/status`,
        body,
      );

      setAppointments((current) =>
        current.map((item) => (item.id === appointment.id ? response.data : item)),
      );

      toast.success(successMessage);

      setActionDialog(null);
    } catch (error) {
      handleActionError(error, FALLBACK_UPDATE_ERROR);
    } finally {
      pendingActionsRef.current.delete(appointment.id);

      setUpdatingId(null);
    }
  };

  const confirmAppointment = (appointment: Appointment) => {
    void runStatusAction(appointment, "CONFIRMED", "Agendamento confirmado.");
  };

  const completeAppointment = (appointment: Appointment) => {
    void runStatusAction(appointment, "COMPLETED", "Agendamento concluído.");
  };

  const markNoShow = (appointment: Appointment) => {
    void runStatusAction(
      appointment,
      "NO_SHOW",
      "Cliente marcado como não compareceu.",
    );
  };

  /*
   * ========================================================
   * CANCELAR COM MOTIVO (diálogo React — motivo obrigatório, trim, máx 500)
   * ========================================================
   */

  const openCancellation = (appointment: Appointment) => {
    setCancellationTarget(appointment);

    setCancellationReason("");
  };

  const closeCancellation = () => {
    setCancellationTarget(null);

    setCancellationReason("");
  };

  const submitCancellation = async () => {
    if (!cancellationTarget) {
      return;
    }

    const reason = cancellationReason.trim();

    if (!reason) {
      return;
    }

    if (pendingActionsRef.current.has(cancellationTarget.id)) {
      return;
    }

    pendingActionsRef.current.add(cancellationTarget.id);

    setCancelling(true);

    try {
      const response = await api.patch<Appointment>(
        `/appointments/${cancellationTarget.id}/status`,
        {
          status: "CANCELLED",

          reason,
        },
      );

      setAppointments((current) =>
        current.map((item) =>
          item.id === cancellationTarget.id ? response.data : item,
        ),
      );

      toast.success("Agendamento cancelado.");

      closeCancellation();
    } catch (error) {
      handleActionError(error, FALLBACK_UPDATE_ERROR);
    } finally {
      pendingActionsRef.current.delete(cancellationTarget.id);

      setCancelling(false);
    }
  };

  /*
   * ========================================================
   * EXCLUIR UM FINALIZADO (contrato atual — somente finalizados)
   * ========================================================
   */

  const runDelete = async (appointment: Appointment) => {
    if (!isFinishedStatus(appointment.status)) {
      return;
    }

    if (pendingActionsRef.current.has(appointment.id)) {
      return;
    }

    pendingActionsRef.current.add(appointment.id);

    setDeletingId(appointment.id);

    try {
      await api.delete(`/appointments/${appointment.id}`);

      setAppointments((current) =>
        current.filter((item) => item.id !== appointment.id),
      );

      toast.success("Agendamento excluído.");

      setActionDialog(null);
    } catch (error) {
      handleActionError(error, FALLBACK_DELETE_ERROR);
    } finally {
      pendingActionsRef.current.delete(appointment.id);

      setDeletingId(null);
    }
  };

  /*
   * ========================================================
   * LIMPAR TODOS OS FINALIZADOS
   * ========================================================
   */

  const runCleanup = async () => {
    if (pendingActionsRef.current.has("cleanup")) {
      return;
    }

    pendingActionsRef.current.add("cleanup");

    setCleaning(true);

    try {
      const response = await api.delete<CleanupResponse>(
        "/appointments/cleanup",
      );

      const deletedIds = response.data?.deletedIds ?? [];

      setAppointments((current) =>
        current.filter((appointment) => !deletedIds.includes(appointment.id)),
      );

      const deletedCount = response.data?.count ?? 0;

      toast.success(
        deletedCount === 0
          ? "Nenhum agendamento finalizado para remover."
          : `${deletedCount} ${
              deletedCount === 1 ? "agendamento removido" : "agendamentos removidos"
            }.`,
      );

      setActionDialog(null);
    } catch (error) {
      handleActionError(error, FALLBACK_CLEANUP_ERROR);
    } finally {
      pendingActionsRef.current.delete("cleanup");

      setCleaning(false);
    }
  };

  const openActionDialog = (dialog: ActionDialog) => {
    setActionDialog(dialog);
  };

  const confirmActionDialog = () => {
    if (!actionDialog) {
      return;
    }

    const { type, appointment } = actionDialog;

    if (type === "CLEANUP") {
      void runCleanup();

      return;
    }

    if (!appointment) {
      return;
    }

    if (type === "COMPLETED") {
      completeAppointment(appointment);
    }

    if (type === "NO_SHOW") {
      markNoShow(appointment);
    }

    if (type === "DELETE") {
      void runDelete(appointment);
    }
  };

  /*
   * ========================================================
   * RENDER — ações permitidas pela matriz (frontend decide o que mostrar;
   * o backend valida e é a autoridade final)
   * ========================================================
   */

  const renderActions = (appointment: Appointment) => {
    const happened = hasHappened(appointment.date);

    const busy = updatingId === appointment.id;

    const deleting = deletingId === appointment.id;

    const canCancel =
      !happened &&
      (appointment.status === "PENDING" || appointment.status === "CONFIRMED");

    const hasActions =
      appointment.status === "PENDING" ||
      (appointment.status === "CONFIRMED" && happened) ||
      canCancel ||
      isFinishedStatus(appointment.status);

    if (!hasActions) {
      return null;
    }

    return (
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {appointment.status === "PENDING" && (
          <Button
            type="button"
            disabled={busy}
            onClick={() => confirmAppointment(appointment)}
            className="bg-green-600 text-white hover:bg-green-700"
          >
            <Check className="mr-2 h-4 w-4" />

            {busy ? "Atualizando..." : "Confirmar"}
          </Button>
        )}

        {appointment.status === "CONFIRMED" && happened && (
          <>
            <Button
              type="button"
              disabled={busy}
              onClick={() => openActionDialog({ type: "COMPLETED", appointment })}
              className="bg-green-600 text-white hover:bg-green-700"
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />

              {busy ? "Atualizando..." : "Concluir"}
            </Button>

            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => openActionDialog({ type: "NO_SHOW", appointment })}
            >
              <UserX className="mr-2 h-4 w-4" />

              {busy ? "Atualizando..." : "Não compareceu"}
            </Button>
          </>
        )}

        {canCancel && (
          <Button
            type="button"
            variant="destructive"
            disabled={busy}
            onClick={() => openCancellation(appointment)}
          >
            <X className="mr-2 h-4 w-4" />

            Cancelar
          </Button>
        )}

        {isFinishedStatus(appointment.status) && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={deleting}
            onClick={() => openActionDialog({ type: "DELETE", appointment })}
            className="text-red-600 hover:bg-red-50 hover:text-red-700"
          >
            <Trash2 className="mr-2 h-4 w-4" />

            {deleting ? "Excluindo..." : "Excluir agendamento"}
          </Button>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6 p-4 sm:p-6">
        {/* ===============================================
            HEADER
        =============================================== */}

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              Meus Agendamentos
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Acompanhe solicitações, atendimentos e histórico.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Badge variant="secondary">
              {appointments.length}{" "}
              {appointments.length === 1 ? "agendamento" : "agendamentos"}
            </Badge>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void fetchAppointments()}
            >
              <RefreshCw className="mr-2 h-4 w-4" />

              Atualizar
            </Button>
          </div>
        </div>

        {/* ===============================================
            RESUMO
        =============================================== */}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs font-medium text-amber-700">
              Aguardando confirmação
            </p>

            <p className="mt-1 text-2xl font-bold text-amber-900">
              {pendingCount}
            </p>
          </div>

          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
            <p className="text-xs font-medium text-blue-700">Confirmados</p>

            <p className="mt-1 text-2xl font-bold text-blue-900">
              {confirmedCount}
            </p>
          </div>

          <div className="col-span-2 rounded-xl border border-gray-200 bg-white p-4 sm:col-span-1">
            <p className="text-xs font-medium text-gray-500">Finalizados</p>

            <p className="mt-1 text-2xl font-bold text-gray-900">
              {finishedCount}
            </p>
          </div>
        </div>

        {/* ===============================================
            TABS — PRÓXIMOS / HISTÓRICO
        =============================================== */}

        <div
          role="tablist"
          aria-label="Agendamentos"
          className="flex flex-wrap items-center gap-2"
        >
          <Button
            type="button"
            role="tab"
            aria-selected={activeTab === "proximos"}
            variant={activeTab === "proximos" ? "default" : "outline"}
            onClick={() => setActiveTab("proximos")}
          >
            <CalendarClock className="mr-2 h-4 w-4" />

            Próximos ({upcomingAppointments.length})
          </Button>

          <Button
            type="button"
            role="tab"
            aria-selected={activeTab === "historico"}
            variant={activeTab === "historico" ? "default" : "outline"}
            onClick={() => setActiveTab("historico")}
          >
            <History className="mr-2 h-4 w-4" />

            Histórico ({historyAppointments.length})
          </Button>
        </div>

        {/* ===============================================
            FILTRO DE STATUS (dentro da tab atual)
        =============================================== */}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
            <Label htmlFor="statusFilter" className="text-sm text-gray-600">
              Filtrar por status
            </Label>

            <select
              id="statusFilter"
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as StatusFilter)
              }
              className="h-9 w-full rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 sm:w-52"
            >
              {FILTER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {activeTab === "historico" && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={cleaning || finishedCount === 0}
              onClick={() => openActionDialog({ type: "CLEANUP" })}
              className="w-fit text-red-600 hover:border-red-200 hover:bg-red-50 hover:text-red-700"
            >
              <Trash2 className="mr-2 h-4 w-4" />

              {cleaning ? "Limpando..." : "Limpar finalizados"}
            </Button>
          )}
        </div>

        {/* ===============================================
            LISTA DA TAB ATUAL
        =============================================== */}

        {tabAppointments.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center">
              {activeTab === "proximos" ? (
                <CalendarClock className="mx-auto h-8 w-8 text-gray-300" />
              ) : (
                <History className="mx-auto h-8 w-8 text-gray-300" />
              )}

              <p className="mt-3 font-medium text-gray-700">
                {activeTab === "proximos"
                  ? "Nenhum próximo agendamento."
                  : "Nenhum agendamento no histórico."}
              </p>
            </CardContent>
          </Card>
        ) : visibleAppointments.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center">
              <p className="font-medium text-gray-700">
                Nenhum agendamento para este filtro.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid items-start gap-4 lg:grid-cols-2">
            {visibleAppointments.map((appointment) => {
              const status = statusConfig[appointment.status];

              return (
                <Card key={appointment.id} className="overflow-hidden">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <CardTitle className="text-lg">
                          {appointment.customer?.name ?? "Cliente não informado"}
                        </CardTitle>

                        {appointment.customer?.phone && (
                          <a
                            href={formatWhatsApp(appointment.customer.phone)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1 inline-block text-sm font-medium text-green-600 hover:text-green-700"
                          >
                            📱 {appointment.customer.phone}
                          </a>
                        )}
                      </div>

                      <Badge variant={status.variant} className="shrink-0">
                        {status.label}
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent>
                    <div className="space-y-3">
                      {appointment.service && (
                        <div>
                          <p className="text-sm font-semibold text-gray-800">
                            {appointment.service.name}
                          </p>

                          <div className="mt-1 flex flex-wrap gap-3 text-xs text-gray-500">
                            <span>
                              ⏱ {appointment.service.durationMinutes} minutos
                            </span>

                            <span>
                              {Number(appointment.service.price).toLocaleString(
                                "pt-BR",
                                {
                                  style: "currency",

                                  currency: "BRL",
                                },
                              )}
                            </span>
                          </div>
                        </div>
                      )}

                      <div className="rounded-lg bg-gray-50 p-3">
                        <p className="text-sm font-semibold text-gray-700">
                          🗓️ {getAppointmentTime(appointment)}
                        </p>
                      </div>

                      {appointment.status === "CANCELLED" &&
                        appointment.cancellationReason && (
                          <div className="rounded-lg border border-red-100 bg-red-50 p-3">
                            <p className="text-xs font-semibold text-red-700">
                              Motivo
                            </p>

                            <p className="mt-1 text-xs leading-5 text-gray-600">
                              {appointment.cancellationReason}
                            </p>
                          </div>
                        )}

                      {renderActions(appointment)}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* ================================================
          DIALOGO DE AÇÃO (Concluir / Não compareceu / Excluir / Limpar)
      ================================================ */}

      <AlertDialog
        open={!!actionDialog}
        onOpenChange={(open) => {
          if (!open) {
            setActionDialog(null);
          }
        }}
      >
        {actionDialog && (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {ACTION_DIALOG_CONTENT[actionDialog.type].title}
              </AlertDialogTitle>

              <AlertDialogDescription>
                {ACTION_DIALOG_CONTENT[actionDialog.type].description}
              </AlertDialogDescription>
            </AlertDialogHeader>

            <AlertDialogFooter>
              <AlertDialogCancel>Voltar</AlertDialogCancel>

              <AlertDialogAction
                variant={
                  ACTION_DIALOG_CONTENT[actionDialog.type].destructive
                    ? "destructive"
                    : "default"
                }
                onClick={confirmActionDialog}
              >
                {ACTION_DIALOG_CONTENT[actionDialog.type].action}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>

      {/* ================================================
          DIALOGO DE CANCELAMENTO COM MOTIVO
      ================================================ */}

      <AlertDialog
        open={!!cancellationTarget}
        onOpenChange={(open) => {
          // Durante o request o diálogo permanece aberto; fecha no sucesso
          // (fechamento explícito) ou no cancelamento manual.
          if (!open && !cancelling) {
            closeCancellation();
          }
        }}
      >
        {cancellationTarget && (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancelar agendamento?</AlertDialogTitle>

              <AlertDialogDescription>
                O motivo será exibido para o cliente ao consultar o
                agendamento.
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="rounded-lg bg-gray-50 p-4">
              <p className="font-medium text-gray-900">
                {cancellationTarget.customer?.name ?? "Cliente"}
              </p>

              <p className="mt-1 text-sm text-gray-600">
                {cancellationTarget.service?.name ?? "Serviço"}
              </p>

              <p className="mt-1 text-sm text-gray-500">
                {getAppointmentTime(cancellationTarget)}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cancellationReason">Motivo</Label>

              <Textarea
                id="cancellationReason"
                rows={5}
                maxLength={500}
                placeholder="Ex.: Preciso me ausentar neste horário. Por favor, escolha um novo horário disponível."
                value={cancellationReason}
                onChange={(event) => setCancellationReason(event.target.value)}
              />

              <p className="text-right text-xs text-gray-400">
                {cancellationReason.length}/500
              </p>
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel disabled={cancelling}>Voltar</AlertDialogCancel>

              <Button
                type="button"
                variant="destructive"
                disabled={cancelling || !cancellationReason.trim()}
                onClick={() => void submitCancellation()}
              >
                {cancelling ? "Salvando..." : "Cancelar agendamento"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </>
  );
}
