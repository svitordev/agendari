'use client';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/hooks/useAuth';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Menu, LayoutDashboard, Sparkles, Clock, User, LogOut } from 'lucide-react';

function NavLink({ href, icon: Icon, children }: { href: string; icon: any; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = pathname === href;
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
        active ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      <Icon className="w-4 h-4" />
      {children}
    </Link>
  );
}

function SidebarContent() {
  const { logout } = useAuth();
  return (
    <>
      <div className="flex items-center gap-2 px-3 py-4 border-b border-gray-200">
        <LayoutDashboard className="w-6 h-6 text-blue-600" />
        <span className="font-bold text-lg text-gray-900">AgendarÍ - Dashboard</span>
      </div>
      <nav className="flex-1 p-4 space-y-1">
        <NavLink href="/dashboard" icon={LayoutDashboard}>Agendamentos</NavLink>
        <NavLink href="/dashboard/services" icon={Sparkles}>Serviços</NavLink>
         <NavLink href="/dashboard/availability" icon={Clock}>Disponibilidade</NavLink>
         <NavLink href="/dashboard/profile" icon={User}>Meu Perfil</NavLink>
      </nav>
      <div className="p-4 border-t border-gray-200">
        <Button variant="outline" className="w-full justify-start text-red-600 hover:text-red-700" onClick={logout}>
          <LogOut className="w-4 h-4 mr-2" />
          Sair
        </Button>
      </div>
    </>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        {/* Mobile */}
        <div className="lg:hidden">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="fixed top-4 left-4 z-40 bg-white shadow-md rounded-full">
                <Menu className="w-5 h-5 text-blue-600" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SidebarContent />
            </SheetContent>
          </Sheet>
        </div>

        {/* Desktop Sidebar */}
        <aside className="hidden lg:flex fixed left-0 top-0 h-screen w-64 bg-white border-r border-gray-200 flex-col">
          <SidebarContent />
        </aside>

        {/* Main Content */}
        <main className="lg:ml-64 p-4 lg:p-8 pt-16 lg:pt-8">
          {children}
        </main>
      </div>
    </ProtectedRoute>
  );
}