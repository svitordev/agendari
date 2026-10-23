'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Pencil, Plus } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { AdminProfessionalsResponse } from '@/types';

const LIMIT = 20;
const DEBOUNCE_MS = 400;

type Status = 'loading' | 'ready' | 'error' | 'denied';

export default function AdminProfessionalsPage() {
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<AdminProfessionalsResponse | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  // Sequência dos requests — resposta obsoleta é descartada (race).
  const seqRef = useRef(0);

  // Debounce do search — evita request a cada tecla.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      // Mudança de termo efetivo reseta a paginação.
      setOffset(0);
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchInput]);

  const fetchPage = useCallback(async () => {
    const seq = ++seqRef.current;
    setStatus('loading');
    try {
      const params: Record<string, string | number> = { limit: LIMIT, offset };
      if (debouncedSearch) params.search = debouncedSearch;
      const res = await api.get<AdminProfessionalsResponse>('/admin/professionals', {
        params,
      });
      if (seq !== seqRef.current) return; // resposta obsoleta — descarta
      setData(res.data);
      setStatus('ready');
    } catch (err) {
      if (seq !== seqRef.current) return; // resposta obsoleta — descarta
      const errStatus = (err as { response?: { status?: number } }).response?.status;
      if (errStatus === 403) {
        // 403 NÃO é logout — o guard já deveria ter impedido chegar aqui.
        setStatus('denied');
      } else {
        setStatus('error');
      }
    }
  }, [debouncedSearch, offset]);

  useEffect(() => {
    void fetchPage();
  }, [fetchPage]);

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const rangeStart = total > 0 ? offset + 1 : 0;
  const rangeEnd = total > 0 ? Math.min(offset + items.length, total) : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Profissionais</h1>
        <Button asChild size="sm">
          <Link href="/admin/professionals/new">
            <Plus className="h-4 w-4" />
            Novo profissional
          </Link>
        </Button>
      </div>

      <Input
        placeholder="Buscar por nome, slug ou email..."
        aria-label="Buscar profissionais"
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        className="max-w-sm"
      />

      {status === 'denied' ? (
        <p role="alert" className="text-sm text-red-600">
          Acesso negado para esta área.
        </p>
      ) : status === 'error' ? (
        <div className="space-y-3">
          <p role="alert" className="text-sm text-red-600">
            Não foi possível carregar os profissionais.
          </p>
          <Button variant="outline" size="sm" onClick={() => void fetchPage()}>
            Tentar novamente
          </Button>
        </div>
      ) : status === 'loading' ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : total === 0 ? (
        <p className="text-sm text-gray-500">
          {debouncedSearch
            ? 'Nenhum profissional encontrado para a busca.'
            : 'Nenhum profissional cadastrado ainda.'}
        </p>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead> </TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Serviços</TableHead>
                <TableHead>Agendamentos</TableHead>
                <TableHead>Criado em</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    {p.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.avatarUrl}
                        alt=""
                        className="h-8 w-8 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-600">
                        {p.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="text-gray-500">{p.slug}</TableCell>
                  <TableCell className="text-gray-500">{p.user?.email ?? '—'}</TableCell>
                  <TableCell>{p._count.services}</TableCell>
                  <TableCell>{p._count.appointments}</TableCell>
                  <TableCell className="text-gray-500">
                    {format(new Date(p.createdAt), 'dd/MM/yyyy', { locale: ptBR })}
                  </TableCell>
                  <TableCell>
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/admin/professionals/${p.id}/edit`}>
                        <Pencil className="h-4 w-4" />
                        Editar
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">
              {rangeStart}–{rangeEnd} de {total}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={offset === 0}
                onClick={() => setOffset((o) => Math.max(0, o - LIMIT))}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={offset + items.length >= total}
                onClick={() => setOffset((o) => o + LIMIT)}
              >
                Próxima
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
