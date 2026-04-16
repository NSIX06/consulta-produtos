import { useRef, useState } from 'react';
import {
  Upload, FileSearch, RefreshCw, BarChart2, Download,
  Trash2, Database, Loader2, AlertTriangle, FileSpreadsheet, DatabaseZap,
} from 'lucide-react';
import { FormatDialog } from '@/components/FormatDialog';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog, AlertDialogTrigger, AlertDialogContent,
  AlertDialogHeader, AlertDialogTitle, AlertDialogDescription,
  AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { parseFile } from '@/lib/parsers';
import { extractDbProducts, extractBudgetItems } from '@/lib/extractor';
import { analyzeAgainstDatabase } from '@/lib/matching';
import { replaceDatabase, markAsCadastrado, clearDatabase, exportCsv } from '@/lib/store';
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';
import type { Product, BudgetItem } from '@/types/product';

const ACCEPTED = '.pdf,.txt,.csv,.docx,.xlsx,.xls,.jpeg,.jpg,.png,.tiff,.tif';

interface SidebarProps {
  products: Product[];
  activeBrand: string;
  onProductsChange: (p: Product[]) => void;
  onBudgetAnalysis: (items: BudgetItem[] | null, fileName?: string) => void;
}

// ─── Seção de label ───────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-4 mb-2 text-[10px] font-bold tracking-[0.18em] uppercase text-[#484f58]">
      {children}
    </p>
  );
}

// ─── Card de estatística ──────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: 'white' | 'amber' | 'emerald';
}) {
  const valueClass =
    color === 'amber'
      ? 'text-amber-400 tabular-nums font-mono font-semibold'
      : color === 'emerald'
      ? 'text-emerald-400 tabular-nums font-mono font-semibold'
      : 'text-[#c9d1d9] tabular-nums font-mono font-semibold';

  return (
    <div className="mx-3 mb-1.5 px-3.5 py-2.5 rounded-lg bg-[#161b22] border border-[#21262d] flex items-center justify-between group hover:border-[#30363d] transition-colors">
      <span className="text-sm text-[#8b949e]">{label}</span>
      <span className={valueClass}>{value.toLocaleString('pt-BR')}</span>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function Sidebar({ products, activeBrand, onProductsChange, onBudgetAnalysis }: SidebarProps) {
  const dbInputRef = useRef<HTMLInputElement>(null);
  const updateInputRef = useRef<HTMLInputElement>(null);
  const budgetInputRef = useRef<HTMLInputElement>(null);

  const [processingDb, setProcessingDb] = useState(false);
  const [processingBudget, setProcessingBudget] = useState(false);
  const [processingUpdate, setProcessingUpdate] = useState(false);
  const [processingFileName, setProcessingFileName] = useState('');
  const [formatOpen, setFormatOpen] = useState(false);

  const total = products.length;
  const pendentes = products.filter((p) => p.status === 'pendente').length;
  const cadastrados = products.filter((p) => p.status === 'cadastrado').length;

  // ── Upload banco de dados ──────────────────────────────────────────────────

  const handleDbUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;

    setProcessingDb(true);
    const allRows: ReturnType<typeof extractDbProducts> = [];
    const errors: string[] = [];

    for (const file of Array.from(files)) {
      try {
        setProcessingFileName(file.name);
        const text = await parseFile(file);
        const rows = extractDbProducts(text);
        if (rows.length === 0) {
          errors.push(`${file.name}: nenhum produto encontrado`);
          continue;
        }
        allRows.push(...rows);
      } catch (err: unknown) {
        errors.push(`${file.name}: ${err instanceof Error ? err.message : 'Erro desconhecido'}`);
      }
    }

    if (allRows.length > 0) {
      const { products: newProducts, count } = replaceDatabase(allRows, activeBrand);
      onProductsChange(newProducts);
      onBudgetAnalysis(null);
      toast.success(`${count} produto(s) carregado(s) no banco`, {
        description: 'Base substituída com sucesso.',
      });
    }

    errors.forEach((err) => toast.error(err));
    setProcessingDb(false);
    setProcessingFileName('');
    if (dbInputRef.current) dbInputRef.current.value = '';
  };

  // ── Analisar orçamento ────────────────────────────────────────────────────

  const handleBudgetUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (products.length === 0) {
      toast.error('Envie o banco de produtos primeiro.');
      return;
    }

    setProcessingBudget(true);
    setProcessingFileName(file.name);

    try {
      const text = await parseFile(file);
      const items = extractBudgetItems(text);

      if (items.length === 0) {
        toast.error('Nenhum item encontrado no orçamento.');
        return;
      }

      const results = analyzeAgainstDatabase(items, products);
      const found = results.filter((r) => r.encontrado).length;
      onBudgetAnalysis(results, file.name);

      toast.success(`${items.length} item(ns) analisado(s)`, {
        description: `${found} encontrado(s) · ${items.length - found} não cadastrado(s)`,
      });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao processar orçamento.');
    } finally {
      setProcessingBudget(false);
      setProcessingFileName('');
      if (budgetInputRef.current) budgetInputRef.current.value = '';
    }
  };

  // ── Atualizar cadastrados ─────────────────────────────────────────────────

  const handleUpdateUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (products.length === 0) {
      toast.error('Nenhum produto no banco.');
      return;
    }

    setProcessingUpdate(true);
    setProcessingFileName(file.name);

    try {
      const text = await parseFile(file);
      const rows = extractDbProducts(text);
      const codes = rows.flatMap((r) => [r.codigo, r.cod_fabricacao].filter(Boolean));
      const { products: updated, updated: count } = markAsCadastrado(activeBrand, codes);
      onProductsChange(updated);
      toast.success(`${count} produto(s) marcado(s) como Cadastrado`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao processar arquivo.');
    } finally {
      setProcessingUpdate(false);
      setProcessingFileName('');
      if (updateInputRef.current) updateInputRef.current.value = '';
    }
  };

  // ── Exportar CSV ──────────────────────────────────────────────────────────

  const handleExportCsv = () => {
    if (!products.length) { toast.error('Nenhum produto para exportar.'); return; }
    const csv = exportCsv(products);
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    saveAs(blob, 'produtos-cadastrados.csv');
    toast.success('CSV exportado!');
  };

  // ── Exportar Excel ────────────────────────────────────────────────────────

  const handleExportXlsx = () => {
    if (!products.length) { toast.error('Nenhum produto para exportar.'); return; }
    const data = products.map((p) => ({
      Descrição: p.descricao,
      Código: p.codigo,
      'Cód. Fabricação': p.cod_fabricacao,
      Status: p.status,
      'Adicionado em': new Date(p.addedAt).toLocaleDateString('pt-BR'),
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Produtos');
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    saveAs(new Blob([out], { type: 'application/octet-stream' }), 'produtos-cadastrados.xlsx');
    toast.success('Excel exportado!');
  };

  // ── Limpar banco ──────────────────────────────────────────────────────────

  const handleClear = () => {
    const remaining = clearDatabase(activeBrand);
    onProductsChange(remaining);
    onBudgetAnalysis(null);
    toast.info(`Banco de dados de ${activeBrand} limpo.`);
  };

  const isProcessing = processingDb || processingBudget || processingUpdate;

  return (
    <aside className="w-[300px] flex-shrink-0 h-screen bg-[#0d1117] border-r border-[#21262d] flex flex-col overflow-hidden">
      {/* ── Logo ──────────────────────────────────────────────────────────── */}
      <div className="px-4 py-5 border-b border-[#21262d]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
            <Database className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[#e6edf3] leading-tight">Consulta de</p>
            <p className="text-xs text-[#8b949e] leading-tight">Produtos Cadastrados</p>
          </div>
        </div>
      </div>

      {/* ── Conteúdo rolável ──────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto scrollbar-thin py-4 space-y-5">

        {/* Processing indicator */}
        {isProcessing && (
          <div className="mx-3 px-3 py-2.5 rounded-lg bg-blue-600/10 border border-blue-500/20 flex items-center gap-2.5">
            <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin flex-shrink-0" />
            <p className="text-xs text-blue-400 truncate">
              {processingFileName || 'Processando...'}
            </p>
          </div>
        )}

        {/* Upload banco */}
        <div>
          <SectionLabel>Upload de Arquivos</SectionLabel>
          <div className="px-3 space-y-1.5">
            <input ref={dbInputRef} type="file" accept={ACCEPTED} multiple className="hidden" onChange={handleDbUpload} />
            <Button
              variant="sidebar-primary"
              className="w-full h-9 text-sm"
              onClick={() => dbInputRef.current?.click()}
              disabled={isProcessing}
            >
              {processingDb ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              Enviar Arquivos
            </Button>
            <p className="text-[11px] text-[#6e7681] px-0.5">
              PDF, TXT, CSV, DOCX, XLSX, JPEG, PNG, TIFF
            </p>
          </div>
        </div>

        <Separator />

        {/* Analisar orçamento */}
        <div>
          <SectionLabel>Analisar Orçamento</SectionLabel>
          <div className="px-3 space-y-1.5">
            <input ref={budgetInputRef} type="file" accept={ACCEPTED} className="hidden" onChange={handleBudgetUpload} />
            <Button
              variant="sidebar-ghost"
              className="w-full h-9 text-sm"
              onClick={() => budgetInputRef.current?.click()}
              disabled={isProcessing || products.length === 0}
            >
              {processingBudget ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileSearch className="w-4 h-4" />
              )}
              Enviar Orçamento
            </Button>
            <p className="text-[11px] text-[#6e7681] px-0.5">
              Verifica quais produtos não estão cadastrados
            </p>
          </div>
        </div>

        <Separator />

        {/* Atualizar cadastrados */}
        <div>
          <SectionLabel>Atualizar Cadastrados</SectionLabel>
          <div className="px-3 space-y-1.5">
            <input ref={updateInputRef} type="file" accept={ACCEPTED} className="hidden" onChange={handleUpdateUpload} />
            <Button
              variant="sidebar-ghost"
              className="w-full h-9 text-sm"
              onClick={() => updateInputRef.current?.click()}
              disabled={isProcessing || products.length === 0}
            >
              {processingUpdate ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Enviar Arquivo Atualizado
            </Button>
            <p className="text-[11px] text-[#6e7681] px-0.5">
              Marca peças já cadastradas no sistema
            </p>
          </div>
        </div>

        <Separator />

        {/* Estatísticas */}
        <div>
          <SectionLabel>
            <span className="flex items-center gap-1.5">
              <BarChart2 className="w-3 h-3" /> Estatísticas
            </span>
          </SectionLabel>
          <StatCard label="Total de Produtos" value={total} color="white" />
          <StatCard label="Pendentes" value={pendentes} color="amber" />
          <StatCard label="Cadastrados" value={cadastrados} color="emerald" />
        </div>

        <Separator />

        {/* Formatar Planilha */}
        <div>
          <SectionLabel>
            <span className="flex items-center gap-1.5">
              <DatabaseZap className="w-3 h-3" /> Formatar Planilha
            </span>
          </SectionLabel>
          <div className="px-3 space-y-1.5">
            <Button
              variant="sidebar-ghost"
              className="w-full h-9 text-sm"
              onClick={() => setFormatOpen(true)}
              disabled={isProcessing}
            >
              <DatabaseZap className="w-4 h-4" />
              Formatar e Importar
            </Button>
            <p className="text-[11px] text-[#6e7681] px-0.5">
              Corrige colunas e exporta ou importa no padrão correto
            </p>
          </div>
        </div>

        <Separator />

        {/* Exportação */}
        <div>
          <SectionLabel>
            <span className="flex items-center gap-1.5">
              <Download className="w-3 h-3" /> Exportação
            </span>
          </SectionLabel>
          <div className="px-3 space-y-1.5">
            <Button
              variant="sidebar-ghost"
              className="w-full h-9 text-sm"
              onClick={handleExportCsv}
              disabled={products.length === 0}
            >
              <FileSpreadsheet className="w-4 h-4" />
              Exportar CSV
            </Button>
            <Button
              variant="sidebar-ghost"
              className="w-full h-9 text-sm"
              onClick={handleExportXlsx}
              disabled={products.length === 0}
            >
              <FileSpreadsheet className="w-4 h-4" />
              Exportar Excel
            </Button>
          </div>
        </div>

        <Separator />

        {/* Zona de perigo */}
        <div>
          <SectionLabel>
            <span className="flex items-center gap-1.5 text-red-500/70">
              <AlertTriangle className="w-3 h-3" /> Zona de Perigo
            </span>
          </SectionLabel>
          <div className="px-3">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="sidebar-danger" className="w-full h-9 text-sm" disabled={products.length === 0}>
                  <Trash2 className="w-4 h-4" />
                  Limpar Banco de Dados
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Limpar banco de dados?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Todos os {total} produto(s) de <strong>{activeBrand}</strong> serão removidos. Esta ação não pode ser desfeita.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleClear}
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    Sim, limpar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

      </div>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <div className="px-4 py-3 border-t border-[#21262d]">
        <p className="text-[10px] text-[#484f58] text-center">
          v2.0 · Consulta de Produtos
        </p>
      </div>

      <FormatDialog
        open={formatOpen}
        activeBrand={activeBrand}
        onClose={() => setFormatOpen(false)}
        onImported={(p) => { onProductsChange(p); onBudgetAnalysis(null); }}
      />
    </aside>
  );
}
