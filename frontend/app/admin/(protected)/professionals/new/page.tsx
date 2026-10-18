'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type {
  AdminCreateProfessionalPayload,
  AdminCreateProfessionalResponse,
} from '@/types';

/*
 * Conveniência de UX do frontend: sugere um slug a partir do nome.
 * O backend NÃO normaliza slug — ele apenas valida /^[a-z0-9-]+$/.
 * Esta função espelha essa regra para orientar o ADMIN antes do envio.
 */
function suggestSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Mesmas regras do DTO do backend (validação de UX — backend é a autoridade).
const SLUG_PATTERN = /^[a-z0-9-]+$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const DEFAULT_VALUES: AdminCreateProfessionalPayload = {
  name: '',
  slug: '',
  email: '',
  firstName: '',
  lastName: '',
  password: '',
};

type ApiError = {
  response?: { status?: number; data?: { message?: string | string[] } };
};

export default function AdminCreateProfessionalPage() {
  const router = useRouter();
  const [formError, setFormError] = useState('');
  // Slug é sugerido do nome apenas enquanto o ADMIN não o editou manualmente.
  const slugTouchedRef = useRef(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<AdminCreateProfessionalPayload>({ defaultValues: DEFAULT_VALUES });

  const nameValue = watch('name');

  useEffect(() => {
    if (!slugTouchedRef.current) {
      setValue('slug', suggestSlug(nameValue));
    }
  }, [nameValue, setValue]);

  const onSubmit = async (data: AdminCreateProfessionalPayload) => {
    if (isSubmitting) return; // proteção contra duplo submit
    setFormError('');
    try {
      await api.post<AdminCreateProfessionalResponse>('/admin/professionals', {
        name: data.name,
        slug: data.slug,
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        password: data.password,
      });
      toast.success('Profissional criado com sucesso.');
      router.push('/admin/professionals');
    } catch (err) {
      const status = (err as ApiError)?.response?.status;
      const raw = (err as ApiError)?.response?.data?.message;
      const messages: string[] = Array.isArray(raw)
        ? raw
        : typeof raw === 'string'
          ? [raw]
          : [];
      if (status === 409) {
        // Mensagens estáveis do backend — mapeadas para o campo correspondente.
        if (messages.includes('E-mail já cadastrado.')) {
          setError('email', { message: 'E-mail já cadastrado.' });
        } else if (messages.includes('Slug já cadastrado.')) {
          setError('slug', { message: 'Slug já cadastrado.' });
        } else {
          setFormError('Já existe um cadastro com esses dados.');
        }
      } else if (status === 400) {
        setFormError(messages.join(' ') || 'Dados inválidos. Verifique os campos.');
      } else if (status === 403) {
        setFormError('Acesso negado para esta área.');
      } else if (status === 401) {
        // 401 é tratado pelo interceptor do Axios (redirect para /admin/login).
      } else {
        setFormError('Não foi possível criar o profissional. Tente novamente.');
      }
    }
  };

  return (
    <div className="max-w-xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Novo profissional</h1>
        <p className="text-sm text-gray-500">
          Cria o profissional e o usuário de acesso correspondente.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profissional + usuário</CardTitle>
          <CardDescription>
            Todos os campos são obrigatórios. A senha inicial não é exibida novamente
            após a criação.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="name">Nome profissional</Label>
              <Input
                id="name"
                type="text"
                autoComplete="off"
                placeholder="Nome exibido na plataforma"
                aria-invalid={errors.name ? true : undefined}
                {...register('name', { required: 'Informe o nome profissional.' })}
              />
              {errors.name && (
                <p className="text-sm text-red-600">{errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="slug">Slug</Label>
              <Input
                id="slug"
                type="text"
                autoComplete="off"
                placeholder="nome-da-profissional"
                aria-invalid={errors.slug ? true : undefined}
                {...register('slug', {
                  required: 'Informe o slug.',
                  pattern: {
                    value: SLUG_PATTERN,
                    message: 'Use apenas letras minúsculas, números e hífens.',
                  },
                })}
                onChange={(e) => {
                  // Edição manual: a sugestão automática para de sobrescrever.
                  slugTouchedRef.current = true;
                  setValue('slug', e.target.value, { shouldValidate: true });
                }}
              />
              {errors.slug && (
                <p className="text-sm text-red-600">{errors.slug.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="profissional@email.com"
                aria-invalid={errors.email ? true : undefined}
                {...register('email', {
                  required: 'Informe o e-mail.',
                  pattern: { value: EMAIL_PATTERN, message: 'E-mail inválido.' },
                })}
              />
              {errors.email && (
                <p className="text-sm text-red-600">{errors.email.message}</p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="firstName">Primeiro nome</Label>
                <Input
                  id="firstName"
                  type="text"
                  autoComplete="given-name"
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
                  aria-invalid={errors.lastName ? true : undefined}
                  {...register('lastName', { required: 'Informe o sobrenome.' })}
                />
                {errors.lastName && (
                  <p className="text-sm text-red-600">{errors.lastName.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Senha inicial</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                placeholder="Mínimo de 8 caracteres"
                aria-invalid={errors.password ? true : undefined}
                {...register('password', {
                  required: 'Informe a senha inicial.',
                  minLength: {
                    value: 8,
                    message: 'A senha deve ter no mínimo 8 caracteres.',
                  },
                })}
              />
              {errors.password && (
                <p className="text-sm text-red-600">{errors.password.message}</p>
              )}
            </div>

            {formError && (
              <p role="alert" className="text-sm text-red-600">
                {formError}
              </p>
            )}

            <div className="flex items-center gap-3 pt-2">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Criando...' : 'Criar profissional'}
              </Button>
              <Link href="/admin/professionals" className="text-sm text-gray-600 hover:underline">
                Voltar para profissionais
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
