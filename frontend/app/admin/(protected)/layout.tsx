'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import AdminRoute from '@/components/admin/AdminRoute';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { LayoutDashboard, Sparkles, LogOut } from 'lucide-react';

/*
 * Shell do backoffice. AdminRoute protege TODO o grupo (protected).
 * /admin/login fica fora, no grupo (auth).
 */
export default function AdminProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminRoute>
      <AdminShell>{children}</AdminShell>
    </AdminRoute>
  );
}

function AdminShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  const navLink = (href: string, Icon: React.ComponentType<{ className?: string }>, label: string) => {
    const active = pathname === href;
    return (
      <Link
        href={href}
        className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
          active ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'
        }`}
      >
        <Icon className="h-4 w-4" />
        {label}
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-3 lg:px-8">
        <div className="flex items-center gap-2">
          <LayoutDashboard className="h-5 w-5 text-blue-600" />
          <span className="text-lg font-bold text-gray-900">Agendari Admin</span>
        </div>
        <nav className="flex items-center gap-2">
          {navLink('/admin', LayoutDashboard, 'Painel')}
          {navLink('/admin/professionals', Sparkles, 'Profissionais')}
        </nav>
        <div className="flex items-center gap-3">
          {user ? (
            <span className="text-sm text-gray-600">
              {user.firstName} {user.lastName}
            </span>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            className="text-red-600 hover:text-red-700"
            onClick={() => logout('/admin/login')}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sair
          </Button>
        </div>
      </header>
      <main className="p-4 lg:p-8">{children}</main>
    </div>
  );
}
