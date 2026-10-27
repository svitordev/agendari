'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import type {
  AdminProfessionalDetails,
  AdminUpdateProfessionalPayload,
  AdminUpdateProfessionalResponse,
} from '@/types';

// Mesmas regras do DTO do backend (validação de UX — backend é a autoridade).
const SLUG_PATTERN = /^[a-z0-9-]+$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const DEFAULT_VALUES: AdminUpdateProfessionalPayload = {
  name: '',
  slug: '',
  email: '',
  firstName: '',
  lastName: '',
};

type ApiError = {
  response?: { status?: number; data?: { message?: string | string[] } };
};

type Status = 'loading' | 'ready' | 'notfound' | 'denied' | 'error';

export default function AdminEditProfessionalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const [routeId, setRouteId] = useState('');
  const [data, setData] = useState<AdminProfessionalDetails | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [formError, setFormError] = useState('');
  // Sequência dos requests — resposta obsoleta é descartada (race).
  const seqRef = useRef(0);
  // Arquivamento — estado dedicado, independente do formulário.
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState('');
  // Espelho síncrono de isArchiving — o Radix dispara close no clique da ação
  // (antes do commit do estado); sem a ref o diálogo fecharia durante o pending.
  const archivingRef = useRef(false);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<AdminUpdateProfessionalPayload>({ defaultValues: DEFAULT_VALUES });

  const fetchProfessional = useCallback(
    async (id: string) => {
      const seq = ++seqRef.current;
      setStatus('loading');
      setFormError('');
      try {
        const res = await api.get<AdminProfessionalDetails>(`/admin/professionals/${id}`);
        if (seq !== seqRef.current) return; // resposta obsoleta — descarta
        setData(res.data);
        // Só aplica estado/reset se a resposta ainda pertencer à sequência atual.
        reset({
          name: res.data.professional.name,
          slug: res.data.professional.slug,
          email: res.data.user?.email ?? '',
          firstName: res.data.user?.firstName ?? '',
          lastName: res.data.user?.lastName ?? '',
        });
        setStatus('ready');
      } catch (err) {
        if (seq !== seqRef.current) return; // resposta obsoleta — descarta
        const errStatus = (err as ApiError).response?.status;
        if (errStatus === 404) {
          setStatus('notfound');
        } else if (errStatus === 403) {
          // 403 NÃO é logout — o guard já deveria ter impedido chegar aqui.
          setStatus('denied');
        } else {
          setStatus('error');
        }
      }
    },
    [reset],
  );

  useEffect(() => {
    void params.then((p) => setRouteId(p.id));
  }, [params]);

  useEffect(() => {
    if (!routeId) return;
    void fetchProfessional(routeId);
  }, [routeId, fetchProfessional]);

  // user=null: exibição somente como referência — nenhum submit, nenhum valor fictício.
  const userNull = status === 'ready' && data !== null && data.user === null;

  // Abre o diálogo de confirmação — sem request implícito ao abrir.
  const openArchiveDialog = () => {
    setArchiveError('');
    setArchiveDialogOpen(true);
  };

  // O diálogo permanece aberto durante pending/erro retry; fecha em
  // sucesso, 404 e Cancelar. Cancelar é bloqueado durante o request.
  const handleArchiveDialogOpenChange = (open: boolean) => {
    if (archivingRef.current) return;
    setArchiveDialogOpen(open);
  };

  // Confirmação do arquivamento — irreversível pela interface nesta versão.
  const confirmArchive = async () => {
    if (archivingRef.current) return; // duplo submit — defesa em profundidade
    archivingRef.current = true;
    setIsArchiving(true);
    setArchiveError('');
    try {
      await api.delete(`/admin/professionals/${routeId}`);
      // 204 (inclusive idempotente — já arquivado) — sucesso.
      toast.success('Profissional arquivado com sucesso.');
      setArchiveDialogOpen(false);
      router.push('/admin/professionals');
    } catch (err) {
      const errStatus = (err as ApiError)?.response?.status;
      if (errStatus === 404) {
        toast.error('Profissional não encontrado.');
        setArchiveDialogOpen(false);
        router.push('/admin/professionals');
      } else if (errStatus === 403) {
        // 403 comum (não é a mensagem de conta do interceptor) — erro inline
        // seguro, sem logout.
        setArchiveError('Acesso negado para esta área.');
      } else if (errStatus === 401) {
        // 401 é tratado pelo interceptor do Axios (logout/redirect) — não duplicar.
      } else {
        // 5xx/rede — permanece na página com erro seguro e retry.
        setArchiveError('Não foi possível arquivar o profissional. Tente novamente.');
      }
    } finally {
      archivingRef.current = false;
      setIsArchiving(false);
    }
  };

  const onSubmit = async (form: AdminUpdateProfessionalPayload) => {
    if (isSubmitting || !data?.user) return; // user=null nunca submete; duplo submit
    setFormError('');
    try {
      await api.patch<AdminUpdateProfessionalResponse>(`/admin/professionals/${routeId}`, {
        name: form.name,
        slug: form.slug,
        email: form.email,
        firstName: form.firstName,
        lastName: form.lastName,
      });
      toast.success('Profissional atualizado com sucesso.');
      router.push('/admin/professionals');
    } catch (err) {
      const errStatus = (err as ApiError)?.response?.status;
      const raw = (err as ApiError)?.response?.data?.message;
      const messages: string[] = Array.isArray(raw)
        ? raw
        : typeof raw === 'string'
          ? [raw]
          : [];
      if (errStatus === 404) {
        // Mantém a tela (sem redirect automático) com a mensagem segura do backend.
        setFormError(messages[0] ?? 'Profissional não encontrado.');
      } else if (errStatus === 409) {
        // Mensagens exatas e estáveis do backend — sem parsing frouxo.
        if (messages.includes('E-mail já cadastrado.')) {
          setError('email', { message: 'E-mail já cadastrado.' });
        } else if (messages.includes('Slug já cadastrado.')) {
          setError('slug', { message: 'Slug já cadastrado.' });
        } else if (messages.includes('Este profissional não possui usuário associado.')) {
          setFormError('Este profissional não possui usuário associado.');
        } else if (
          messages.includes('O cadastro foi alterado durante a operação. Recarregue e tente novamente.')
        ) {
          setFormError('O cadastro foi alterado durante a operação. Recarregue e tente novamente.');
        } else {
          setFormError('Não foi possível atualizar o profissional devido a um conflito.');
        }
      } else if (errStatus === 400) {
        setFormError(messages.join(' ') || 'Dados inválidos. Verifique os campos.');
      } else if (errStatus === 403) {
        setFormError('Acesso negado para esta área.');
      } else if (errStatus === 401) {
        // 401 é tratado pelo interceptor do Axios (redirect para /admin/login).
      } else {
        setFormError('Não foi possível atualizar o profissional. Tente novamente.');
      }
    }
  };

  return (
    <div className="max-w-xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Editar profissional</h1>
        <p className="text-sm text-gray-500">
          Atualiza os dados do profissional e do usuário de acesso correspondente.
        </p>
      </div>

      {status === 'loading' ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : status === 'notfound' ? (
        <div className="space-y-3">
          <p role="alert" className="text-sm text-gray-700">
            Profissional não encontrado.
          </p>
          <Link href="/admin/professionals" className="text-sm text-blue-600 hover:underline">
            Voltar para profissionais
          </Link>
        </div>
      ) : status === 'denied' ? (
        <p role="alert" className="text-sm text-red-600">
          Acesso negado para esta área.
        </p>
      ) : status === 'error' ? (
        <div className="space-y-3">
          <p role="alert" className="text-sm text-red-600">
            Não foi possível carregar o profissional.
          </p>
          <Button variant="outline" size="sm" onClick={() => void fetchProfessional(routeId)}>
            Tentar novamente
          </Button>
        </div>
      ) : data ? (
        <Card>
          <CardHeader>
            <CardTitle>Profissional + usuário</CardTitle>
            <CardDescription>
              Todos os campos são obrigatórios. A senha não é alterada aqui.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {userNull && (
              <p
                role="alert"
                className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800"
              >
                Este profissional não possui usuário associado.
              </p>
            )}
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
              <div className="space-y-2">
                <Label htmlFor="name">Nome profissional</Label>
                <Input
                  id="name"
                  type="text"
                  autoComplete="off"
                  disabled={userNull}
                  aria-invalid={errors.name ? true : undefined}
                  {...register('name', { required: 'Informe o nome profissional.' })}
                />
                {errors.name && <p className="text-sm text-red-600">{errors.name.message}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="slug">Slug</Label>
                <Input
                  id="slug"
                  type="text"
                  autoComplete="off"
                  disabled={userNull}
                  aria-invalid={errors.slug ? true : undefined}
                  {...register('slug', {
                    required: 'Informe o slug.',
                    pattern: {
                      value: SLUG_PATTERN,
                      message: 'Use apenas letras minúsculas, números e hífens.',
                    },
                  })}
                />
                {errors.slug && <p className="text-sm text-red-600">{errors.slug.message}</p>}
                <p className="text-xs text-gray-500">
                  Alterar o slug muda a URL pública do profissional.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  disabled={userNull}
                  aria-invalid={errors.email ? true : undefined}
                  {...register('email', {
                    required: 'Informe o e-mail.',
                    pattern: { value: EMAIL_PATTERN, message: 'E-mail inválido.' },
                  })}
                />
                {errors.email && <p className="text-sm text-red-600">{errors.email.message}</p>}
                <p className="text-xs text-gray-500">
                  Alterar o e-mail muda a credencial usada pelo profissional para entrar.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="firstName">Primeiro nome</Label>
                  <Input
                    id="firstName"
                    type="text"
                    autoComplete="given-name"
                    disabled={userNull}
                    aria-invalid={errors.firstName ? true : undefined}
                    {...register('firstName', { required: 'Informe o primeiro nome.' })}
                  />
                  {errors.firstName && (
                    <p className="text-sm text-red-600">{errors.firstName.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="lastName">Sobrenome</Label>
                  <Input
                    id="lastName"
                    type="text"
                    autoComplete="family-name"
                    disabled={userNull}
                    aria-invalid={errors.lastName ? true : undefined}
                    {...register('lastName', { required: 'Informe o sobrenome.' })}
                  />
                  {errors.lastName && (
                    <p className="text-sm text-red-600">{errors.lastName.message}</p>
                  )}
                </div>
              </div>

              {formError && (
                <p role="alert" className="text-sm text-red-600">
                  {formError}
                </p>
              )}

              <div className="flex items-center gap-3 pt-2">
                <Button type="submit" disabled={isSubmitting || !data.user}>
                  {isSubmitting ? 'Salvando...' : 'Salvar'}
                </Button>
                <Link
                  href="/admin/professionals"
                  className="text-sm text-gray-600 hover:underline"
                >
                  Voltar para profissionais
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {/* Zona de perigo — visível sempre que a página está pronta, inclusive user=null. */}
      {status === 'ready' && data && (
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="text-red-700">Zona de perigo</CardTitle>
            <CardDescription>
              Arquivar desativa o perfil. Não há restauração pela interface nesta versão.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="destructive" onClick={openArchiveDialog} disabled={isArchiving}>
              Arquivar profissional
            </Button>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={archiveDialogOpen} onOpenChange={handleArchiveDialogOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Arquivar profissional?</AlertDialogTitle>
            <AlertDialogDescription>
              O perfil deixa de aparecer publicamente e o login fica bloqueado.
              Novos agendamentos ficam bloqueados. Agendamentos existentes serão
              preservados. Os dados e o histórico são mantidos. Não há restauração
              pela interface nesta versão.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {archiveError && (
            <p role="alert" className="text-sm text-red-600">
              {archiveError}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isArchiving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => void confirmArchive()}
              disabled={isArchiving}
            >
              {isArchiving ? 'Arquivando...' : 'Arquivar profissional'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
