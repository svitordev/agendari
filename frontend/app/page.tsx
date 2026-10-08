'use client';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CalendarDays, Sparkles, BarChart3 } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <header className="text-center py-20 px-6 bg-gradient-to-br from-blue-50 via-white to-indigo-50">
        <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
          AgendarÍ
        </h1>
        <p className="text-lg md:text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
          Plataforma completa de agendamento para profissionais da beleza.
          Gerencie seus horários, serviços e clientes de forma simples.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button size="lg" asChild>
            <Link href="/professional/jessicasantana">
              Agendar Agora
            </Link>
          </Button>
          <Button variant="outline" size="lg" asChild>
            <Link href="/agendamentos">
              Meus Agendamentos
            </Link>
          </Button>
          <Button variant="outline" size="lg" asChild>
            <Link href="/login">
              Área do Profissional
            </Link>
          </Button>
        </div>
      </header>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <h2 className="text-3xl font-bold text-center mb-12">Como Funciona</h2>
        <div className="grid md:grid-cols-3 gap-8">
          <Card>
            <CardHeader>
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                <CalendarDays className="w-6 h-6 text-blue-600" />
              </div>
              <CardTitle>Agendamento Fácil</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">Clientes escolhem o horário ideal diretamente pelo calendário online.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center mb-4">
                <Sparkles className="w-6 h-6 text-indigo-600" />
              </div>
              <CardTitle>Gerencie Serviços</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">Adicione, edite e organize seus serviços com preços e durações.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
                <BarChart3 className="w-6 h-6 text-purple-600" />
              </div>
              <CardTitle>Dashboard Completo</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">Visualize agendamentos, confirme ou cancele com um clique.</p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="text-center py-8 text-gray-500 text-sm">
        AgendarÍ &copy; 2026 - Projeto de Extensão Universitária
      </footer>
    </div>
  );
}