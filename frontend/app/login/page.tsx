'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ARCHIVED_ACCOUNT_MESSAGE,
  ARCHIVED_REASON,
  SUSPENDED_ACCOUNT_MESSAGE,
  SUSPENDED_REASON,
} from '@/lib/suspension';

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();
  // Vindo de sessão previamente ativa que foi suspensa ou arquivada: aviso
  // fixo local. A query nunca é renderizada diretamente (somente comparada
  // com a constante); qualquer outro valor de ?reason é ignorado.
  const searchParams = useSearchParams();
  const reason = searchParams.get('reason');
  const accountNotice =
    reason === SUSPENDED_REASON
      ? SUSPENDED_ACCOUNT_MESSAGE
      : reason === ARCHIVED_REASON
        ? ARCHIVED_ACCOUNT_MESSAGE
        : '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erro ao fazer login.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50 px-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center space-y-2">
          <CardTitle className="text-3xl text-gray-900">AgendarÍ - Login</CardTitle>
          <p className="text-sm text-gray-500">Faça login para continuar</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700" htmlFor="email">Email</label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" required />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700" htmlFor="password">Senha</label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="******" required />
            </div>
            {accountNotice && (
              <p role="alert" className="text-sm font-medium text-red-600">{accountNotice}</p>
            )}
            {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Entrando...' : 'Entrar'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// useSearchParams exige Suspense boundary no App Router (Next 16) — o build
// falha em prerender sem ele.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
