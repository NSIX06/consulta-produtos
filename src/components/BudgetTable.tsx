import { useState, useMemo, useRef, useEffect } from 'react';
import {
  Search, ChevronLeft, ChevronRight, CheckCircle2, XCircle,
  Download, ArrowLeft, Sparkles, Zap, Type, BarChart3, Plus, Check, X,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import type { BudgetItem } from '@/types/product';

const PAGE_SIZE = 20;

interface BudgetTableProps {
  items: BudgetItem[];
  fileName?: string;
  onClose: () => void;
  onAddToDatabase?: (item: BudgetItem, codigo: string) => void;
}

function MatchBadge({ item }: { item: BudgetItem }) {
  if (!item.encontrado) return null;
  if (item.matchedBy === 'exato') {
    return (
      <Badge variant="exato" className="gap-1 text-[10px]">
        <Zap className="w-2.5 h-2.5" /> Exato
      </Badge>
    );
  }
  if (item.matchedBy === 'fuzzy') {
    return (
      <Badge variant="fuzzy" className="gap-1 text-[10px]">
        <Sparkles className="w-2.5 h-2.5" /> Fuzzy {item.matchScore}%
      </Badge>
    );
  }
  return (
    <Badge variant="default" className="gap-1 text-[10px]">
      <Type className="w-2.5 h-2.5" /> Desc.
    </Badge>
  );
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 90 ? 'bg-blue-500' : score >= 75 ? 'bg-violet-500' : 'bg-amber-400';
  return (
    <div className="w-12 h-1.5 rounded-full bg-slate-100 overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
    </div>
  );
}

export function BudgetTable({ items, fileName, onClose, onAddToDatabase }: BudgetTableProps) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState<'todos' | 'encontrado' | 'nao_encontrado'>('todos');

  // Controle do input inline de adição ao banco
  const [addingItem, setAddingItem] = useState<BudgetItem | null>(null);
  const [addCode, setAddCode] = useState('');
  const addInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (addingItem) addInputRef.current?.focus();
  }, [addingItem]);

  const handleOpenAdd = (item: BudgetItem) => {
    setAddingItem(item);
    setAddCode(item.codigo ?? '');
  };

  const handleConfirmAdd = () => {
    if (!addingItem) return;
    onAddToDatabase?.(addingItem, addCode.trim());
    setAddingItem(null);
    setAddCode('');
  };

  const handleCancelAdd = () => {
    setAddingItem(null);
    setAddCode('');
  };

  const encontrados = items.filter((i) => i.encontrado).length;
  const naoEncontrados = items.length - encontrados;
  const taxa = items.length > 0 ? Math.round((encontrados / items.length) * 100) : 0;

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter((item) => {
      const matchSearch =
        item.descricao.toLowerCase().includes(q) ||
        item.cod_fabricacao.toLowerCase().includes(q) ||
        item.codigo.toLowerCase().includes(q);
      const matchFilter =
        filter === 'todos' ||
        (filter === 'encontrado' && item.encontrado) ||
        (filter === 'nao_encontrado' && !item.encontrado);
      return matchSearch && matchFilter;
    });
  }, [items, search, filter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const paginated = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  const handleExportNaoCadastrados = () => {
    const naoCadastrados = items.filter((i) => !i.encontrado);
    if (!naoCadastrados.length) return;
    const data = naoCadastrados.map((item) => ({
      Descrição: item.descricao,
      Código: item.codigo,
      'Cód. Fabricação': item.cod_fabricacao,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Não Cadastrados');
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    saveAs(new Blob([out], { type: 'application/octet-stream' }), 'nao-cadastrados.xlsx');
    toast.success(`${naoCadastrados.length} item(ns) exportado(s)`);
  };

  const handleExportAll = () => {
    const data = items.map((item) => ({
      Descrição: item.descricao,
      Código: item.codigo,
      'Cód. Fabricação': item.cod_fabricacao,
      'Cód. Cadastrado': item.matchedProduct?.codigo ?? '',
      'Cód. Fab. Cadastrado': item.matchedProduct?.cod_fabricacao ?? '',
      Situação: item.encontrado ? 'Encontrado' : 'Não cadastrado',
      'Tipo de Match': item.matchedBy ?? '',
      'Score (%)': item.matchScore ?? '',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Análise de Orçamento');
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    saveAs(new Blob([out], { type: 'application/octet-stream' }), 'analise-orcamento.xlsx');
    toast.success('Relatório completo exportado!');
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

  return (
    <div className="flex flex-col animate-fade-in">
      {/* Header */}
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 text-sm"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Produtos
            </button>
            <span className="text-muted-foreground/40">/</span>
            <span className="text-sm font-medium">Análise de Orçamento</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Análise de Orçamento</h1>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-sm text-muted-foreground">
              Cruzamento do orçamento com a base de produtos cadastrados
            </p>
            {fileName && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 border border-blue-200 text-xs font-medium text-blue-700 font-mono">
                📄 {fileName}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Button variant="outline" size="sm" onClick={handleExportNaoCadastrados} disabled={naoEncontrados === 0}>
            <Download className="w-3.5 h-3.5" />
            Não Cadastrados
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportAll}>
            <Download className="w-3.5 h-3.5" />
            Relatório Completo
          </Button>
        </div>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-white rounded-xl border border-border p-4 shadow-sm">
          <p className="text-xs text-muted-foreground mb-1">Total de Itens</p>
          <p className="text-2xl font-bold text-foreground font-mono">{items.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-emerald-200 p-4 shadow-sm">
          <p className="text-xs text-emerald-600 mb-1 font-medium">Encontrados</p>
          <p className="text-2xl font-bold text-emerald-600 font-mono">{encontrados}</p>
        </div>
        <div className="bg-white rounded-xl border border-red-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-red-500 font-medium">Não Cadastrados</p>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <BarChart3 className="w-3 h-3" /> {taxa}% match
            </div>
          </div>
          <p className="text-2xl font-bold text-red-500 font-mono">{naoEncontrados}</p>
        </div>
      </div>

      {/* Barra de filtros */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder="Pesquisar no orçamento..."
            className="pl-9 h-9"
          />
        </div>
        <Tabs value={filter} onValueChange={(v) => { setFilter(v as typeof filter); setPage(0); }}>
          <TabsList>
            <TabsTrigger value="todos">Todos ({items.length})</TabsTrigger>
            <TabsTrigger value="encontrado">Encontrados ({encontrados})</TabsTrigger>
            <TabsTrigger value="nao_encontrado">Não Cadastrados ({naoEncontrados})</TabsTrigger>
          </TabsList>
        </Tabs>
        <span className="text-sm text-muted-foreground ml-auto">
          {filtered.length.toLocaleString('pt-BR')} resultado(s)
        </span>
      </div>

      {/* Tabela */}
      <div className="rounded-xl border border-border bg-white shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
              <TableHead className="w-12 text-center">#</TableHead>
              <TableHead>Descrição do Orçamento</TableHead>
              <TableHead>Cód. Fabricação</TableHead>
              <TableHead>Cód. Cadastrado</TableHead>
              <TableHead className="text-center w-36">Situação</TableHead>
              <TableHead className="text-center w-48">Ação / Match</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginated.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-40 text-center text-sm text-muted-foreground">
                  Nenhum resultado encontrado.
                </TableCell>
              </TableRow>
            ) : (
              paginated.map((item, i) => (
                <TableRow
                  key={`${item.cod_fabricacao}-${i}`}
                  className={item.encontrado ? '' : 'bg-red-50/40'}
                >
                  <TableCell className="text-center text-xs text-muted-foreground font-mono">
                    {currentPage * PAGE_SIZE + i + 1}
                  </TableCell>
                  <TableCell className="font-medium text-sm max-w-xs" title={item.descricao}>
                    <span className="block truncate">{item.descricao}</span>
                  </TableCell>
                  <TableCell className="font-mono text-sm text-muted-foreground">
                    {item.cod_fabricacao || '—'}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {item.matchedProduct ? (
                      <span className="text-blue-700 font-medium">
                        {item.matchedProduct.codigo || item.matchedProduct.cod_fabricacao}
                      </span>
                    ) : '—'}
                  </TableCell>
                  <TableCell className="text-center">
                    {item.encontrado ? (
                      <Badge variant="success" className="gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Cadastrado
                      </Badge>
                    ) : (
                      <Badge variant="danger" className="gap-1">
                        <XCircle className="w-3 h-3" /> Não Cadastrado
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {item.encontrado ? (
                      <div className="flex flex-col items-center gap-1">
                        <MatchBadge item={item} />
                        {item.matchScore !== undefined && item.matchScore < 100 && (
                          <ScoreBar score={item.matchScore} />
                        )}
                      </div>
                    ) : onAddToDatabase && addingItem === item ? (
                      <form
                        onSubmit={(e) => { e.preventDefault(); handleConfirmAdd(); }}
                        className="flex items-center gap-1 justify-center"
                      >
                        <input
                          ref={addInputRef}
                          value={addCode}
                          onChange={(e) => setAddCode(e.target.value)}
                          placeholder="Código da empresa..."
                          className="h-7 w-32 px-2 text-xs border border-blue-400 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                        />
                        <button
                          type="submit"
                          title="Confirmar e adicionar ao banco"
                          className="h-7 w-7 flex items-center justify-center rounded-md bg-emerald-500 hover:bg-emerald-600 text-white transition-colors flex-shrink-0"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={handleCancelAdd}
                          title="Cancelar"
                          className="h-7 w-7 flex items-center justify-center rounded-md border border-border hover:border-red-400 hover:text-red-500 transition-colors flex-shrink-0"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </form>
                    ) : onAddToDatabase ? (
                      <button
                        onClick={() => handleOpenAdd(item)}
                        title="Adicionar ao banco de dados como Cadastrado"
                        className="flex items-center gap-1 px-2 h-7 rounded-md border border-dashed border-emerald-400 text-emerald-600 hover:bg-emerald-50 transition-colors text-xs font-medium mx-auto"
                      >
                        <Plus className="w-3 h-3" /> Adicionar
                      </button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Legenda de match */}
      <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><Zap className="w-3 h-3 text-blue-500" /> Exato — token normalizado</span>
        <span className="flex items-center gap-1"><Sparkles className="w-3 h-3 text-violet-500" /> Fuzzy — similaridade Fuse.js</span>
        <span className="flex items-center gap-1"><Type className="w-3 h-3 text-slate-400" /> Desc. — descrição exata</span>
      </div>

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3">
          <span className="text-xs text-muted-foreground">Página {currentPage + 1} de {totalPages}</span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={currentPage === 0} className="h-8 w-8 p-0">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            {getPageNumbers().map((pg, idx) =>
              pg === '…' ? (
                <span key={`e${idx}`} className="flex items-center justify-center w-8 h-8 text-xs text-muted-foreground">…</span>
              ) : (
                <Button key={pg} variant={pg === currentPage ? 'default' : 'outline'} size="sm" onClick={() => setPage(pg as number)} className="h-8 w-8 p-0 text-xs">
                  {(pg as number) + 1}
                </Button>
              )
            )}
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={currentPage >= totalPages - 1} className="h-8 w-8 p-0">
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
