'use client';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Sparkles } from 'lucide-react';

/*
 * Painel inicial do backoffice — somente navegação.
 * Métricas/pagamentos/auditoria não fazem parte desta entrega.
 */
export default function AdminDashboardPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Painel administrativo</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link href="/admin/professionals">
          <Card className="transition hover:ring-blue-300">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-5 w-5 text-blue-600" />
                Profissionais
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-gray-500">
              Ver todos os profissionais cadastrados
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
