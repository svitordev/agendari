"use client";

import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Edit2, Plus, Trash2 } from "lucide-react";

import api from "@/lib/api";
import type { Service } from "@/types";
import { useAuth } from "@/hooks/useAuth";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { Button } from "@/components/ui/button";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type ServiceFormData = {
  name: string;
  description: string;
  durationMinutes: number;
  price: number;
};

const DEFAULT_FORM_VALUES: ServiceFormData = {
  name: "",
  description: "",
  durationMinutes: 30,
  price: 0,
};

export default function ServicesPage() {
  const { user } = useAuth();

  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);

  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ServiceFormData>({
    defaultValues: DEFAULT_FORM_VALUES,
  });

  /*
   * Busca os serviços do profissional.
   * O backend já identifica/filtra o profissional através da autenticação.
   */
  const fetchServices = useCallback(async () => {
    try {
      const response = await api.get<Service[]>("/services");

      setServices(response.data ?? []);
    } catch (err) {
      console.error("Erro ao buscar serviços:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchServices();
  }, [fetchServices, user]);

  /*
   * Abre o formulário para criar ou editar.
   */
  const handleOpenModal = (service: Service | null = null) => {
    if (service) {
      setEditingService(service);

      reset({
        name: service.name,
        description: service.description ?? "",
        durationMinutes: service.durationMinutes,
        price: Number(service.price),
      });
    } else {
      setEditingService(null);
      reset(DEFAULT_FORM_VALUES);
    }

    setIsSheetOpen(true);
  };

  /*
   * Fecha o formulário.
   */
  const handleCloseModal = () => {
    setIsSheetOpen(false);
    setEditingService(null);
    reset(DEFAULT_FORM_VALUES);
  };

  /*
   * Cria ou atualiza um serviço.
   */
  const onSubmit = async (data: ServiceFormData) => {
    if (isSaving) return;

    setIsSaving(true);

    try {
      if (editingService) {
        /*
         * EDIÇÃO
         *
         * Não enviamos professionalId no PATCH.
         */
        await api.patch(`/services/${editingService.id}`, data);
      } else {
        /*
         * CRIAÇÃO
         *
         * O backend resolve o professionalId do JWT.
         * Não enviamos professionalId no body.
         */
        await api.post("/services", data);
      }

      await fetchServices();

      handleCloseModal();
    } catch (err) {
      console.error("Erro ao salvar serviço:", err);

      alert(
        editingService ? "Erro ao editar serviço." : "Erro ao criar serviço.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  /*
   * Exclui um serviço.
   */
  const handleDelete = async (id: string) => {
    const confirmed = window.confirm("Deseja realmente excluir este serviço?");

    if (!confirmed) return;

    setDeletingId(id);

    try {
      await api.delete(`/services/${id}`);

      /*
       * Remove imediatamente da tela sem precisar
       * fazer outra consulta ao backend.
       */
      setServices((currentServices) =>
        currentServices.filter((service) => service.id !== id),
      );
    } catch (error: any) {
      console.error("Erro ao excluir serviço:", error);

      const message = error.response?.data?.message;

      alert(
        Array.isArray(message)
          ? message.join("\n")
          : (message ?? "Erro ao excluir serviço."),
      );
    } finally {
      setDeletingId(null);
    }
  };

  /*
   * Ativa ou desativa um serviço.
   */
  const toggleActive = async (id: string, currentStatus: boolean) => {
    if (togglingId === id) return;

    setTogglingId(id);

    const newStatus = !currentStatus;

    try {
      await api.patch(`/services/${id}`, {
        isActive: newStatus,
      });

      /*
       * Atualização local.
       * Evita GET desnecessário depois do PATCH.
       */
      setServices((currentServices) =>
        currentServices.map((service) =>
          service.id === id
            ? {
                ...service,
                isActive: newStatus,
              }
            : service,
        ),
      );
    } catch (err) {
      console.error("Erro ao alterar status do serviço:", err);

      alert("Erro ao alterar status do serviço.");
    } finally {
      setTogglingId(null);
    }
  };

  /*
   * Loading inicial.
   */
  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Meus Serviços</h2>

        <Button
          type="button"
          onClick={() => handleOpenModal()}
          className="cursor-pointer transition-colors hover:bg-blue-700"
        >
          <Plus className="mr-2 h-4 w-4" />
          Novo Serviço
        </Button>
      </div>

      {/* Formulário lateral */}
      <Sheet
        open={isSheetOpen}
        onOpenChange={(open) => {
          if (!open) {
            handleCloseModal();
          } else {
            setIsSheetOpen(true);
          }
        }}
      >
        <SheetContent className="overflow-y-auto p-6 sm:max-w-106.25">
          <SheetHeader className="mb-4">
            <SheetTitle>
              {editingService ? "Editar Serviço" : "Novo Serviço"}
            </SheetTitle>

            <SheetDescription>
              {editingService
                ? "Altere os dados do serviço selecionado."
                : "Preencha os dados para cadastrar um novo serviço."}
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Nome */}
            <div className="space-y-2">
              <Label htmlFor="name">Nome</Label>

              <Input
                id="name"
                placeholder="Ex.: Corte de cabelo"
                disabled={isSaving}
                {...register("name", {
                  required: "Informe o nome do serviço.",
                  minLength: {
                    value: 2,
                    message: "O nome deve possuir pelo menos 2 caracteres.",
                  },
                })}
              />

              {errors.name && (
                <p className="text-sm text-red-600">{errors.name.message}</p>
              )}
            </div>

            {/* Descrição */}
            <div className="space-y-2">
              <Label htmlFor="description">Descrição</Label>

              <Textarea
                id="description"
                placeholder="Descreva brevemente o serviço..."
                disabled={isSaving}
                {...register("description")}
              />
            </div>

            {/* Duração + preço */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="durationMinutes">Duração (min)</Label>

                <Input
                  id="durationMinutes"
                  type="number"
                  min={1}
                  step={1}
                  disabled={isSaving}
                  {...register("durationMinutes", {
                    valueAsNumber: true,
                    required: "Informe a duração do serviço.",
                    min: {
                      value: 1,
                      message: "A duração deve ser maior que zero.",
                    },
                  })}
                />

                {errors.durationMinutes && (
                  <p className="text-sm text-red-600">
                    {errors.durationMinutes.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="price">Preço (R$)</Label>

                <Input
                  id="price"
                  type="number"
                  min={0.01}
                  step="0.01"
                  disabled={isSaving}
                  {...register("price", {
                    valueAsNumber: true,
                    required: "Informe o preço do serviço.",
                    min: {
                      value: 0.01,
                      message: "O preço deve ser maior que zero.",
                    },
                  })}
                />

                {errors.price && (
                  <p className="text-sm text-red-600">{errors.price.message}</p>
                )}
              </div>
            </div>

            {/* Botões */}
            <SheetFooter className="pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleCloseModal}
                disabled={isSaving}
              >
                Cancelar
              </Button>

              <Button type="submit" disabled={isSaving}>
                {isSaving
                  ? "Salvando..."
                  : editingService
                    ? "Salvar alterações"
                    : "Cadastrar serviço"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {/* Lista */}
      {services.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <p className="font-medium text-gray-700">
              Nenhum serviço cadastrado
            </p>

            <p className="mt-1 text-sm text-gray-500">
              Cadastre seu primeiro serviço para começar.
            </p>

            <Button
              type="button"
              className="mt-4"
              onClick={() => handleOpenModal()}
            >
              <Plus className="mr-2 h-4 w-4" />
              Novo Serviço
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {services.map((service) => {
            const isDeleting = deletingId === service.id;

            const isToggling = togglingId === service.id;

            return (
              <Card key={service.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <CardTitle className="text-lg">{service.name}</CardTitle>

                      {service.description && (
                        <p className="mt-1 text-sm text-gray-500">
                          {service.description}
                        </p>
                      )}
                    </div>

                    <button
                      type="button"
                      disabled={isToggling}
                      onClick={() => toggleActive(service.id, service.isActive)}
                      className={`shrink-0 cursor-pointer rounded-full px-3 py-1 text-xs font-medium transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50 ${
                        service.isActive
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-200 text-gray-600"
                      }`}
                    >
                      {isToggling
                        ? "Alterando..."
                        : service.isActive
                          ? "Ativo"
                          : "Inativo"}
                    </button>
                  </div>
                </CardHeader>

                <CardContent>
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex flex-wrap gap-3 text-sm text-gray-600">
                      <span>⏱ {service.durationMinutes} min</span>

                      <span className="font-semibold text-blue-600">
                        {Number(service.price).toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        })}
                      </span>
                    </div>

                    <div className="flex gap-2">
                      {/* Editar */}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={isDeleting}
                        onClick={() => handleOpenModal(service)}
                        className="cursor-pointer transition-colors hover:bg-gray-100"
                        aria-label={`Editar ${service.name}`}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>

                      {/* Excluir */}
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        disabled={isDeleting}
                        onClick={() => handleDelete(service.id)}
                        className="cursor-pointer transition-colors hover:bg-red-700"
                        aria-label={`Excluir ${service.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
