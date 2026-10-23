'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
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
    </div>
  );
}
