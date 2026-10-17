'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

/*
 * Guard da área ADMIN (frontend apenas — o backend é a autoridade real).
 * - sem sessão → /admin/login
 * - role !== ADMIN → /login (fluxo profissional)
 * - ADMIN → renderiza children
 * Não renderiza children antes da validação (evita flash de conteúdo protegido).
 */
export default function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/admin/login');
    } else if (user.role !== 'ADMIN') {
      router.replace('/login');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user || user.role !== 'ADMIN') return null;

  return <>{children}</>;
}
