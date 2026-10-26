"use client";

import { useEffect, useMemo, useState } from "react";

import Calendar from "react-calendar";

import { addMonths, format, parse } from "date-fns";

import {
  CalendarDays,
  Check,
  Clock3,
  Search,
  Sparkles,
  UserRound,
} from "lucide-react";

import {
  FaFacebookF,
  FaInstagram,
  FaWhatsapp,
} from 'react-icons/fa';

import api from "@/lib/api";

import type { ProfessionalStatus } from "@/types";

import CustomerAppointments from "@/components/public/CustomerAppointments";

import "react-calendar/dist/Calendar.css";

type ThemeColors = {
  primary?: string;
  secondary?: string;
  accent?: string;
};

type Professional = {
  id: string;
  slug: string;
  name: string;
  bio?: string | null;
  avatarUrl?: string | null;
  instagram?: string | null;
  facebook?: string | null;
  whatsapp?: string | null;
  themeColors?: ThemeColors | null;
  status: ProfessionalStatus;
};

type ServiceItem = {
  id: string;
  name: string;
  description?: string | null;
  durationMinutes: number;
  price: number;
  isActive: boolean;
};

type SlotItem = {
  time: string;
  available: boolean;
};

type AvailableSlotsResponse = {
  available: boolean;
  slots: SlotItem[];
  message?: string;
};

/*
 * Mesmo tema padrão da Landing Page.
 */
const DEFAULT_THEME = {
  primary: "#2563EB",
  secondary: "#4F46E5",
  accent: "#7C3AED",
};

function normalizePhone(phone: string) {
  return phone.replace(/\D/g, "");
}

function getContrastColor(hex: string) {
  const normalized = hex.replace("#", "");

  if (normalized.length !== 6) {
    return "#ffffff";
  }

  const r = parseInt(normalized.substring(0, 2), 16);

  const g = parseInt(normalized.substring(2, 4), 16);

  const b = parseInt(normalized.substring(4, 6), 16);

  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  return luminance > 0.62 ? "#111827" : "#ffffff";
}

function socialUrl(value: string, type: "instagram" | "facebook") {
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }

  const clean = value.replace(/^@/, "").trim();

  if (type === "instagram") {
    return `https://instagram.com/${clean}`;
  }

  return `https://facebook.com/${clean}`;
}

function whatsappUrl(phone: string) {
  const clean = normalizePhone(phone);

  const normalized = clean.startsWith("55") ? clean : `55${clean}`;

  return `https://wa.me/${normalized}`;
}

export default function ProfessionalPage({
  params,
}: {
  params: Promise<{
    slug: string;
  }>;
}) {
  const [professional, setProfessional] = useState<Professional | null>(null);

  const [services, setServices] = useState<ServiceItem[]>([]);

  const [selectedService, setSelectedService] = useState("");

  const [selectedDate, setSelectedDate] = useState("");

  const [slots, setSlots] = useState<SlotItem[]>([]);

  const [selectedSlot, setSelectedSlot] = useState("");

  const [clientName, setClientName] = useState("");

  const [clientWhats, setClientWhats] = useState("");

  const [loading, setLoading] = useState(true);

  const [loadingSlots, setLoadingSlots] = useState(false);

  const [booking, setBooking] = useState(false);

  const [slotsMessage, setSlotsMessage] = useState("");

  const [bookingConfirmed, setBookingConfirmed] = useState(false);

  const [lookupPhone, setLookupPhone] = useState("");

  const [appointmentsRefreshKey, setAppointmentsRefreshKey] = useState(0);

  /*
   * ========================================================
   * PROFISSIONAL
   * ========================================================
   */

  useEffect(() => {
    const load = async () => {
      try {
        const { slug } = await params;

        const professionalResponse = await api.get<Professional>(
          `/professionals/slug/${slug}`,
        );

        const data = professionalResponse.data;

        setProfessional(data);

        const servicesResponse = await api.get<ServiceItem[]>(
          `/services/professional/${data.id}`,
        );

        setServices(servicesResponse.data ?? []);
      } catch (error) {
        console.error("Erro ao carregar profissional:", error);

        setProfessional(null);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [params]);

  /*
   * ========================================================
   * SLOTS
   * ========================================================
   */

  useEffect(() => {
    const fetchSlots = async () => {
      if (!professional || !selectedService || !selectedDate) {
        setSlots([]);
        setSelectedSlot("");
        setSlotsMessage("");

        return;
      }

      setLoadingSlots(true);

      setSelectedSlot("");

      setSlotsMessage("");

      try {
        const response = await api.get<AvailableSlotsResponse>(
          "/appointments/available",
          {
            params: {
              date: selectedDate,

              professionalId: professional.id,

              serviceId: selectedService,
            },
          },
        );

        setSlots(response.data.slots ?? []);

        if (!response.data.available || response.data.slots.length === 0) {
          setSlotsMessage(
            response.data.message ?? "Nenhum horário disponível nesta data.",
          );
        }
      } catch (error: any) {
        const message = error.response?.data?.message;

        setSlots([]);

        setSlotsMessage(
          Array.isArray(message)
            ? message.join(", ")
            : (message ?? "Erro ao buscar horários disponíveis."),
        );
      } finally {
        setLoadingSlots(false);
      }
    };

    fetchSlots();
  }, [professional, selectedService, selectedDate]);

  /*
   * ========================================================
   * AGENDAR
   * ========================================================
   */

  const handleBooking = async () => {
    if (!professional) {
      return;
    }

    // Defesa em profundidade: o CTA já nasce desabilitado para suspensos —
    // backend continua a autoridade (403 com mensagem própria de booking,
    // que NÃO dispara o fluxo de sessão suspensa no interceptor).
    if (professional.status === "SUSPENDED") {
      return;
    }

    if (!selectedService) {
      alert("Selecione um serviço.");

      return;
    }

    if (!selectedDate) {
      alert("Selecione uma data.");

      return;
    }

    if (!selectedSlot) {
      alert("Selecione um horário.");

      return;
    }

    if (!clientName.trim()) {
      alert("Informe seu nome.");

      return;
    }

    const normalizedWhats = normalizePhone(clientWhats);

    if (normalizedWhats.length < 10) {
      alert("Informe um WhatsApp válido.");

      return;
    }

    setBooking(true);

    try {
      await api.post("/appointments", {
        professionalId: professional.id,

        serviceId: selectedService,

        dateTime: `${selectedDate}T${selectedSlot}:00`,

        clientName: clientName.trim(),

        clientWhats: normalizedWhats,
      });

      setLookupPhone(normalizedWhats);

      setBookingConfirmed(true);

      setAppointmentsRefreshKey((current) => current + 1);

      setSlots((current) =>
        current.map((slot) =>
          slot.time === selectedSlot
            ? {
                ...slot,
                available: false,
              }
            : slot,
        ),
      );

      setSelectedSlot("");

      setTimeout(() => {
        document.getElementById("meus-agendamentos")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 150);
    } catch (error: any) {
      const message = error.response?.data?.message;

      alert(
        Array.isArray(message)
          ? message.join("\n")
          : (message ?? "Erro ao realizar agendamento."),
      );

      if (error.response?.status === 409) {
        setSelectedSlot("");
      }
    } finally {
      setBooking(false);
    }
  };

  /*
   * ========================================================
   * LOADING
   * ========================================================
   */

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-11 w-11 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600" />
      </div>
    );
  }

  if (!professional) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="rounded-xl border bg-white p-8 text-center shadow-sm">
          <p className="font-semibold text-gray-900">
            Profissional não encontrado.
          </p>
        </div>
      </div>
    );
  }

  const theme = {
    primary: professional.themeColors?.primary ?? DEFAULT_THEME.primary,

    secondary: professional.themeColors?.secondary ?? DEFAULT_THEME.secondary,

    accent: professional.themeColors?.accent ?? DEFAULT_THEME.accent,
  };

  const buttonTextColor = getContrastColor(theme.primary);

  const activeServices = services.filter((service) => service.isActive);

  const currentService = activeServices.find(
    (service) => service.id === selectedService,
  );

  const scrollToBooking = () => {
    document.getElementById("agendar")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  return (
    <>
      <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 pb-16">
        {/* ==============================================
            PERFIL
        ============================================== */}

        <div className="mx-auto max-w-4xl px-4 pt-5 sm:pt-8">
          <section className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            {/* barra de identidade */}
            <div
              className="h-2 w-full"
              style={{
                background: `linear-gradient(90deg, ${theme.primary}, ${theme.secondary}, ${theme.accent})`,
              }}
            />

            <div className="px-5 py-6 text-center sm:px-8 sm:py-8">
              {professional.avatarUrl ? (
                <img
                  src={professional.avatarUrl}
                  alt={professional.name}
                  className="mx-auto h-20 w-20 rounded-full border-4 border-white object-cover shadow-md"
                />
              ) : (
                <div
                  className="mx-auto flex h-20 w-20 items-center justify-center rounded-full"
                  style={{
                    color: theme.primary,
                    backgroundColor: `${theme.primary}15`,
                  }}
                >
                  <UserRound className="h-9 w-9" />
                </div>
              )}

              <h1 className="mt-4 text-2xl font-bold text-gray-900 sm:text-3xl">
                {professional.name}
              </h1>

              {professional.bio && (
                <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-gray-500 sm:text-base">
                  {professional.bio}
                </p>
              )}

              {/* redes */}
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {professional.instagram && (
                  <a
                    href={socialUrl(professional.instagram, "instagram")}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-full border bg-white px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
                  >
                    <FaInstagram
                      className="h-4 w-4"
                      style={{
                        color: theme.accent,
                      }}
                    />
                    Instagram
                  </a>
                )}

                {professional.facebook && (
                  <a
                    href={socialUrl(professional.facebook, "facebook")}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-full border bg-white px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
                  >
                    <FaFacebookF
                      className="h-4 w-4"
                      style={{
                        color: theme.secondary,
                      }}
                    />
                    Facebook
                  </a>
                )}

                {professional.whatsapp && (
                  <a
                    href={whatsappUrl(professional.whatsapp)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-full border bg-white px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
                  >
                    <FaWhatsapp className="h-4 w-4 text-green-600" />
                    WhatsApp
                  </a>
                )}
              </div>

              <button
                type="button"
                onClick={() =>
                  document.getElementById("meus-agendamentos")?.scrollIntoView({
                    behavior: "smooth",
                  })
                }
                className="mt-5 inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition hover:bg-gray-50"
                style={{
                  color: theme.secondary,

                  borderColor: `${theme.secondary}50`,
                }}
              >
                <Search className="h-4 w-4" />
                Consultar meus agendamentos
              </button>
            </div>
          </section>
        </div>

        {/* ==============================================
            AGENDAMENTO
        ============================================== */}

        <div id="agendar" className="mx-auto mt-6 max-w-4xl scroll-mt-6 px-4">
          <div className="mb-5">
            <div className="flex items-center gap-2">
              <Sparkles
                className="h-5 w-5"
                style={{
                  color: theme.primary,
                }}
              />

              <h2 className="text-xl font-bold text-gray-900 sm:text-2xl">
                Agende seu horário
              </h2>
            </div>

            <p className="mt-1 text-sm text-gray-500">
              Escolha o serviço, a data e o melhor horário para você.
            </p>

            {professional.status === "SUSPENDED" && (
              <p
                role="status"
                className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900"
              >
                Este profissional não está aceitando novos agendamentos no
                momento.
              </p>
            )}
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            {/* ==========================================
                SERVIÇO
            ========================================== */}

            <BookingCard
              number="1"
              title="Escolha o serviço"
              primaryColor={theme.primary}
            >
              <select
                value={selectedService}
                onChange={(event) => {
                  setSelectedService(event.target.value);

                  setSelectedDate("");
                  setSelectedSlot("");
                }}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-3 text-sm text-gray-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              >
                <option value="">Selecione um serviço...</option>

                {activeServices.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name} —{" "}
                    {Number(service.price).toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })}{" "}
                    • {service.durationMinutes} min
                  </option>
                ))}
              </select>

              {currentService && (
                <div className="mt-3 rounded-lg bg-gray-50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        {currentService.name}
                      </p>

                      {currentService.description && (
                        <p className="mt-1 text-xs leading-5 text-gray-500">
                          {currentService.description}
                        </p>
                      )}
                    </div>

                    <div
                      className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold"
                      style={{
                        color: theme.secondary,
                        backgroundColor: `${theme.secondary}12`,
                      }}
                    >
                      {currentService.durationMinutes} min
                    </div>
                  </div>
                </div>
              )}
            </BookingCard>

            {/* ==========================================
                DATA
            ========================================== */}

            <BookingCard
              number="2"
              title="Escolha a data"
              primaryColor={theme.primary}
            >
              {!selectedService ? (
                <div className="flex min-h-[260px] items-center justify-center rounded-xl border border-dashed bg-gray-50 p-6 text-center">
                  <div>
                    <CalendarDays className="mx-auto h-8 w-8 text-gray-300" />

                    <p className="mt-3 text-sm font-medium text-gray-500">
                      Selecione um serviço primeiro
                    </p>

                    <p className="mt-1 text-xs text-gray-400">
                      Depois você poderá escolher uma data disponível.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="booking-calendar-container">
                  <Calendar
                    locale="pt-BR"
                    className="booking-calendar"
                    prev2Label={null}
                    next2Label={null}
                    minDetail="month"
                    maxDetail="month"
                    onChange={(value) => {
                      if (value instanceof Date) {
                        setSelectedDate(format(value, "yyyy-MM-dd"));

                        setSelectedSlot("");
                      }
                    }}
                    value={
                      selectedDate
                        ? parse(selectedDate, "yyyy-MM-dd", new Date())
                        : null
                    }
                    minDate={new Date()}
                    maxDate={addMonths(new Date(), 2)}
                  />
                </div>
              )}
            </BookingCard>

            {/* ==========================================
                HORÁRIO
            ========================================== */}

            <BookingCard
              number="3"
              title="Escolha o horário"
              primaryColor={theme.primary}
            >
              {!selectedDate || !selectedService ? (
                <div className="flex min-h-32 items-center justify-center rounded-xl border border-dashed bg-gray-50 p-6 text-center">
                  <div>
                    <Clock3 className="mx-auto h-7 w-7 text-gray-300" />

                    <p className="mt-2 text-sm text-gray-400">
                      Escolha serviço e data para visualizar os horários.
                    </p>
                  </div>
                </div>
              ) : loadingSlots ? (
                <div className="flex min-h-32 items-center justify-center gap-3 text-sm text-gray-500">
                  <div
                    className="h-5 w-5 animate-spin rounded-full border-2 border-gray-200 border-t-transparent"
                    style={{
                      borderTopColor: theme.primary,
                    }}
                  />
                  Buscando horários...
                </div>
              ) : slots.length > 0 ? (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {slots.map((slot) => {
                    const selected = selectedSlot === slot.time;

                    return (
                      <button
                        type="button"
                        key={slot.time}
                        disabled={!slot.available}
                        onClick={() => setSelectedSlot(slot.time)}
                        style={
                          selected
                            ? {
                                backgroundColor: theme.primary,

                                color: buttonTextColor,
                              }
                            : undefined
                        }
                        className={`rounded-lg border px-3 py-2.5 text-sm font-medium transition ${
                          !slot.available
                            ? "cursor-not-allowed border-gray-100 bg-gray-100 text-gray-300"
                            : selected
                              ? "border-transparent shadow-sm"
                              : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50"
                        }`}
                      >
                        {slot.time}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-500">
                  {slotsMessage || "Nenhum horário disponível nesta data."}
                </div>
              )}
            </BookingCard>

            {/* ==========================================
                DADOS
            ========================================== */}

            <BookingCard
              number="4"
              title="Seus dados"
              primaryColor={theme.primary}
            >
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label
                    htmlFor="clientName"
                    className="text-sm font-medium text-gray-700"
                  >
                    Nome completo
                  </label>

                  <input
                    id="clientName"
                    type="text"
                    value={clientName}
                    onChange={(event) => setClientName(event.target.value)}
                    placeholder="Digite seu nome"
                    autoComplete="name"
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="clientWhats"
                    className="text-sm font-medium text-gray-700"
                  >
                    WhatsApp
                  </label>

                  <input
                    id="clientWhats"
                    type="tel"
                    value={clientWhats}
                    onChange={(event) => setClientWhats(event.target.value)}
                    placeholder="Ex.: (81) 99999-9999"
                    autoComplete="tel"
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              </div>
            </BookingCard>
          </div>

          {/* ==========================================
              RESUMO + CONFIRMAR
          ========================================== */}

          <div className="mt-5 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div
              className="h-1 w-full"
              style={{
                background: `linear-gradient(90deg, ${theme.primary}, ${theme.secondary})`,
              }}
            />

            <div className="p-5">
              <div className="flex items-center gap-2">
                <Check
                  className="h-5 w-5"
                  style={{
                    color: theme.primary,
                  }}
                />

                <p className="font-semibold text-gray-900">
                  Resumo do agendamento
                </p>
              </div>

              {selectedService && selectedDate && selectedSlot ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <SummaryItem
                    label="Serviço"
                    value={currentService?.name ?? "-"}
                  />

                  <SummaryItem
                    label="Data"
                    value={format(
                      parse(selectedDate, "yyyy-MM-dd", new Date()),
                      "dd/MM/yyyy",
                    )}
                  />

                  <SummaryItem label="Horário" value={selectedSlot} />
                </div>
              ) : (
                <p className="mt-3 text-sm text-gray-400">
                  Complete as etapas acima para confirmar seu agendamento.
                </p>
              )}

              <button
                type="button"
                disabled={
                  professional.status === "SUSPENDED" ||
                  !selectedService ||
                  !selectedDate ||
                  !selectedSlot ||
                  !clientName.trim() ||
                  !clientWhats.trim() ||
                  booking
                }
                onClick={handleBooking}
                style={{
                  backgroundColor: theme.primary,

                  color: buttonTextColor,
                }}
                className="mt-5 w-full rounded-xl py-3.5 text-sm font-bold shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none"
              >
                {booking
                  ? "Confirmando agendamento..."
                  : "Confirmar agendamento"}
              </button>
            </div>
          </div>

          {/* ==========================================
              MEUS AGENDAMENTOS
          ========================================== */}

          <section
            id="meus-agendamentos"
            className="mt-10 scroll-mt-6 border-t border-gray-200 pt-8"
          >
            <div className="mb-4">
              <h2 className="text-xl font-bold text-gray-900">
                Meus agendamentos
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                Consulte o status dos seus horários usando seu WhatsApp.
              </p>
            </div>

            <CustomerAppointments
              professionalId={professional.id}
              initialPhone={lookupPhone}
              refreshKey={appointmentsRefreshKey}
              bookingConfirmed={bookingConfirmed}
              primaryColor={theme.primary}
              onRebook={scrollToBooking}
            />
          </section>
        </div>
      </main>

      {/* ==============================================
          CALENDAR STYLE
      ============================================== */}

      <style jsx global>{`
        .booking-calendar-container {
          overflow: hidden;
          border-radius: 0.75rem;
        }

        .booking-calendar {
          width: 100%;
          max-width: none;
          border: 0;
          background: transparent;
          font-family: inherit;
        }

        .booking-calendar .react-calendar__navigation {
          display: flex;
          align-items: center;
          height: 44px;
          margin-bottom: 8px;
        }

        .booking-calendar .react-calendar__navigation button {
          min-width: 40px;
          border-radius: 9px;
          font-size: 13px;
          font-weight: 600;
          color: #374151;
        }

        .booking-calendar
          .react-calendar__navigation
          button:hover:not(:disabled),
        .booking-calendar
          .react-calendar__navigation
          button:focus:not(:disabled) {
          background: #f3f4f6;
        }

        .booking-calendar .react-calendar__navigation__label {
          flex-grow: 1 !important;
        }

        .booking-calendar .react-calendar__month-view__weekdays {
          color: #6b7280;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
        }

        .booking-calendar .react-calendar__month-view__weekdays__weekday {
          padding: 7px 2px;
        }

        .booking-calendar .react-calendar__month-view__weekdays__weekday abbr {
          text-decoration: none;
        }

        .booking-calendar .react-calendar__tile {
          min-height: 43px;
          border-radius: 9px;
          padding: 7px 2px;
          font-size: 12px;
          color: #374151;
        }

        .booking-calendar .react-calendar__tile:hover:not(:disabled),
        .booking-calendar .react-calendar__tile:focus {
          background: #eff6ff;
        }

        .booking-calendar .react-calendar__tile--now {
          background: #f3f4f6;
          font-weight: 700;
        }

        .booking-calendar .react-calendar__tile--active,
        .booking-calendar .react-calendar__tile--active:hover,
        .booking-calendar .react-calendar__tile--active:focus {
          background: ${theme.primary};
          color: ${buttonTextColor};
          font-weight: 700;
        }

        .booking-calendar
          .react-calendar__month-view__days__day--neighboringMonth {
          color: #d1d5db;
        }

        .booking-calendar .react-calendar__tile:disabled {
          background: transparent;
          color: #d1d5db;
        }
      `}</style>
    </>
  );
}

/*
 * ==========================================================
 * COMPONENTES DA PÁGINA
 * ==========================================================
 */

function BookingCard({
  number,
  title,
  primaryColor,
  children,
}: {
  number: string;
  title: string;
  primaryColor: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold"
          style={{
            color: primaryColor,
            backgroundColor: `${primaryColor}12`,
          }}
        >
          {number}
        </div>

        <h3 className="font-semibold text-gray-900">{title}</h3>
      </div>

      {children}
    </section>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-gray-50 px-3 py-2.5">
      <p className="text-xs text-gray-400">{label}</p>

      <p className="mt-0.5 truncate text-sm font-semibold text-gray-800">
        {value}
      </p>
    </div>
  );
}
