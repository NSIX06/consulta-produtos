import { useState, useMemo, useRef, useEffect } from 'react';
import { Search, ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, PackageSearch, Check, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import type { Product, SortField, SortDirection } from '@/types/product';

const PAGE_SIZE = 20;

interface ProductTableProps {
  products: Product[];
  brandName?: string;
  onStatusChange?: (id: string, status: 'pendente' | 'cadastrado', codigo?: string) => void;
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDirection }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 text-muted-foreground/40" />;
  return dir === 'asc'
    ? <ArrowUp className="w-3 h-3 text-blue-600" />
    : <ArrowDown className="w-3 h-3 text-blue-600" />;
}

export function ProductTable({ products, brandName, onStatusChange }: ProductTableProps) {
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('original');
  const [sortDir, setSortDir] = useState<SortDirection>('asc');
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState<'todos' | 'pendente' | 'cadastrado'>('todos');

  // Controle do input inline de código
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [inputCode, setInputCode] = useState('');
  const codeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (confirmingId) codeInputRef.current?.focus();
  }, [confirmingId]);

  const handleOpenConfirm = (p: Product) => {
    setConfirmingId(p.id);
    setInputCode(p.codigo ?? '');
  };

  const handleConfirmCadastro = (id: string) => {
    onStatusChange?.(id, 'cadastrado', inputCode.trim() || undefined);
    setConfirmingId(null);
    setInputCode('');
  };

  const handleCancelConfirm = () => {
    setConfirmingId(null);
    setInputCode('');
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return products.filter((p) => {
      const matchSearch =
        p.descricao.toLowerCase().includes(q) ||
        p.codigo.toLowerCase().includes(q) ||
        p.cod_fabricacao.toLowerCase().includes(q);
      const matchStatus = statusFilter === 'todos' || p.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [products, search, statusFilter]);

  const sorted = useMemo(() => {
    if (sortField === 'original') {
      return [...filtered].sort((a, b) => {
        const ao = a.order ?? 0;
        const bo = b.order ?? 0;
        return sortDir === 'asc' ? ao - bo : bo - ao;
      });
    }
    return [...filtered].sort((a, b) => {
      const cmp = a[sortField].localeCompare(b[sortField], 'pt-BR');
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const paginated = sorted.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  const pendentes = products.filter((p) => p.status === 'pendente').length;
  const cadastrados = products.filter((p) => p.status === 'cadastrado').length;

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortField(field); setSortDir('asc'); }
    setPage(0);
  };

  const getPageNumbers = (): (number | '…')[] => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i);
    const pages: (number | '…')[] = [0];
    if (currentPage > 2) pages.push('…');
    for (let i = Math.max(1, currentPage - 1); i <= Math.min(totalPages - 2, currentPage + 1); i++) pages.push(i);
    if (currentPage < totalPages - 3) pages.push('…');
    pages.push(totalPages - 1);
    return pages;
  };

  const ThBtn = ({ field, label }: { field: SortField; label: string }) => (
    <button
      onClick={() => handleSort(field)}
      className="flex items-center gap-1.5 hover:text-foreground transition-colors"
    >
      {label} <SortIcon active={sortField === field} dir={sortDir} />
    </button>
  );

  return (
    <div className="flex flex-col animate-fade-in">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">
          {brandName ? `${brandName}` : 'Produtos Cadastrados'}
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Gerencie e consulte produtos extraídos de documentos
        </p>
      </div>

      {/* Barra de filtros */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder="Pesquisar por descrição, código..."
            className="pl-9 h-9"
          />
        </div>

        {/* Ordenação */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground mr-0.5">Ordem:</span>
          {([
            { field: 'original' as SortField, label: 'Planilha' },
            { field: 'descricao' as SortField, label: 'A–Z' },
          ]).map(({ field, label }) => (
            <button
              key={field}
              onClick={() => handleSort(field)}
              className={`flex items-center gap-1 px-3 h-8 rounded-lg text-xs font-medium border transition-colors ${
                sortField === field
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-muted-foreground border-border hover:border-blue-400 hover:text-blue-600'
              }`}
            >
              {label}
              {sortField === field && (
                sortDir === 'asc'
                  ? <ArrowUp className="w-3 h-3" />
                  : <ArrowDown className="w-3 h-3" />
              )}
            </button>
          ))}
        </div>

        <div className="flex gap-1.5">
          {[
            { key: 'todos', label: `Todos (${products.length})` },
            { key: 'pendente', label: `Pendentes (${pendentes})` },
            { key: 'cadastrado', label: `Cadastrados (${cadastrados})` },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => { setStatusFilter(key as typeof statusFilter); setPage(0); }}
              className={`px-3 h-9 rounded-lg text-sm font-medium border transition-colors ${
                statusFilter === key
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-muted-foreground border-border hover:border-blue-400 hover:text-blue-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="text-sm text-muted-foreground ml-auto">
          {filtered.length.toLocaleString('pt-BR')} resultado(s)
        </span>
      </div>

      {/* Tabela */}
      <div className="rounded-xl border border-border bg-white shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/80 hover:bg-slate-50/80 border-b border-border">
              <TableHead className="w-12 text-center">#</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead><ThBtn field="codigo" label="Código" /></TableHead>
              <TableHead><ThBtn field="cod_fabricacao" label="Cód. Fabricação" /></TableHead>
              <TableHead className="text-center w-32">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginated.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-48 text-center">
                  <div className="flex flex-col items-center gap-3 text-muted-foreground">
                    <PackageSearch className="w-10 h-10 opacity-30" />
                    <p className="text-sm">
                      {products.length === 0
                        ? 'Nenhum produto. Envie um arquivo pela barra lateral.'
                        : 'Nenhum resultado para a pesquisa.'}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              paginated.map((p, i) => (
                <TableRow key={p.id}>
                  <TableCell className="text-center text-xs text-muted-foreground font-mono">
                    {currentPage * PAGE_SIZE + i + 1}
                  </TableCell>
                  <TableCell className="font-medium text-sm max-w-xs truncate" title={p.descricao}>
                    {p.descricao}
                  </TableCell>
                  <TableCell className="font-mono text-sm text-muted-foreground">{p.codigo || '—'}</TableCell>
                  <TableCell className="font-mono text-sm">{p.cod_fabricacao || '—'}</TableCell>
                  <TableCell className="text-center">
                    {onStatusChange && confirmingId === p.id ? (
                      // Input inline para inserir o código ao cadastrar
                      <form
                        onSubmit={(e) => { e.preventDefault(); handleConfirmCadastro(p.id); }}
                        className="flex items-center gap-1 justify-center"
                      >
                        <input
                          ref={codeInputRef}
                          value={inputCode}
                          onChange={(e) => setInputCode(e.target.value)}
                          placeholder="Código do sistema..."
                          className="h-7 w-36 px-2 text-xs border border-blue-400 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                        />
                        <button
                          type="submit"
                          title="Confirmar cadastro"
                          className="h-7 w-7 flex items-center justify-center rounded-md bg-emerald-500 hover:bg-emerald-600 text-white transition-colors flex-shrink-0"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={handleCancelConfirm}
                          title="Cancelar"
                          className="h-7 w-7 flex items-center justify-center rounded-md border border-border hover:border-red-400 hover:text-red-500 transition-colors flex-shrink-0"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </form>
                    ) : onStatusChange && p.status === 'pendente' ? (
                      <button onClick={() => handleOpenConfirm(p)} title="Clique para marcar como Cadastrado" className="group">
                        <Badge variant="warning" className="cursor-pointer transition-opacity group-hover:opacity-75">
                          Pendente
                        </Badge>
                      </button>
                    ) : onStatusChange && p.status === 'cadastrado' ? (
                      <button onClick={() => onStatusChange(p.id, 'pendente')} title="Clique para voltar a Pendente" className="group">
                        <Badge variant="success" className="cursor-pointer transition-opacity group-hover:opacity-75">
                          Cadastrado
                        </Badge>
                      </button>
                    ) : (
                      <Badge variant={p.status === 'cadastrado' ? 'success' : 'warning'}>
                        {p.status === 'cadastrado' ? 'Cadastrado' : 'Pendente'}
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-xs text-muted-foreground">
            Página {currentPage + 1} de {totalPages}
          </span>
          <div className="flex gap-1">
            <Button
              variant="outline" size="sm"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={currentPage === 0}
              className="h-8 w-8 p-0"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            {getPageNumbers().map((pg, idx) =>
              pg === '…' ? (
                <span key={`e${idx}`} className="flex items-center justify-center w-8 h-8 text-xs text-muted-foreground">…</span>
              ) : (
                <Button
                  key={pg}
                  variant={pg === currentPage ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setPage(pg as number)}
                  className="h-8 w-8 p-0 text-xs"
                >
                  {(pg as number) + 1}
                </Button>
              )
            )}
            <Button
              variant="outline" size="sm"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={currentPage >= totalPages - 1}
              className="h-8 w-8 p-0"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
