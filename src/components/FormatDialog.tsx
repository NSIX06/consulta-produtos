/**
 * FormatDialog.tsx
 * Assistente de 3 etapas para formatar e importar planilhas:
 *   1. Upload do arquivo
 *   2. Mapeamento de colunas (usuário confirma qual coluna é qual)
 *   3. Prévia do resultado → baixar ou importar
 */

import { useRef, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Loader2, Upload, CheckCircle2, Download, DatabaseZap,
  ArrowRight, ArrowLeft, FileSpreadsheet,
} from 'lucide-react';
import { toast } from 'sonner';
import { parseFile } from '@/lib/parsers';
import { parseRawColumns, applyColumnMapping, type RawColumnData } from '@/lib/extractor';
import { replaceDatabase } from '@/lib/store';
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';
import type { ParsedRow, Product } from '@/types/product';

const ACCEPTED = '.pdf,.txt,.csv,.docx,.xlsx,.xls,.jpeg,.jpg,.png,.tiff,.tif';
const PREVIEW_MAX = 8;

type ColRole = 'descricao' | 'codigo' | 'cod_fabricacao' | 'ignorar';

const ROLE_LABELS: Record<ColRole, string> = {
  descricao: 'Descrição',
  codigo: 'Código',
  cod_fabricacao: 'Cód. Fabricação',
  ignorar: 'Ignorar',
};

const ROLE_COLORS: Record<ColRole, string> = {
  descricao: 'bg-blue-50 text-blue-700 border-blue-200',
  codigo: 'bg-violet-50 text-violet-700 border-violet-200',
  cod_fabricacao: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  ignorar: 'bg-slate-50 text-slate-400 border-slate-200',
};

interface FormatDialogProps {
  open: boolean;
  onClose: () => void;
  onImported: (products: Product[]) => void;
}

type Step = 'upload' | 'mapping' | 'preview';

export function FormatDialog({ open, onClose, onImported }: FormatDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('upload');
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState('');
  const [rawText, setRawText] = useState('');
  const [colData, setColData] = useState<RawColumnData | null>(null);
  const [mapping, setMapping] = useState<ColRole[]>([]);
  const [result, setResult] = useState<ParsedRow[] | null>(null);
  const [fabWasMapped, setFabWasMapped] = useState(false); // false = extraído da descrição

  // ── Heurística inicial de mapeamento ──────────────────────────────────────
  function guessMapping(headers: string[]): ColRole[] {
    const norm = (s: string) =>
      s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

    const roles: ColRole[] = headers.map(() => 'ignorar');
    let descSet = false, codSet = false, fabSet = false;

    headers.forEach((h, i) => {
      const n = norm(h);
      if (!fabSet && (n.includes('fabric') || n.includes('fab') || n.includes('cod fab') || n.includes('cod.fab'))) {
        roles[i] = 'cod_fabricacao'; fabSet = true;
      } else if (!descSet && (n.includes('descri') || n.includes('produto') || n.includes('nome'))) {
        roles[i] = 'descricao'; descSet = true;
      } else if (!codSet && (n.startsWith('cod') || n === 'ref' || n.includes('referen') || n === 'codigo' || n === 'part' || n === 'no')) {
        roles[i] = 'codigo'; codSet = true;
      }
    });

    // Se não encontrou pelo header, tentar pelo conteúdo das primeiras células
    // (só para colunas ainda não mapeadas)
    return roles;
  }

  // ── Upload ────────────────────────────────────────────────────────────────
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setFileName(file.name);
    try {
      const text = await parseFile(file);
      const raw = parseRawColumns(text);
      if (!raw || raw.headers.length < 2) {
        toast.error('Não foi possível detectar colunas no arquivo. Verifique o formato.');
        setFileName('');
      } else {
        setRawText(text);
        setColData(raw);
        setMapping(guessMapping(raw.headers));
        setStep('mapping');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao processar arquivo.');
      setFileName('');
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  // ── Aplicar mapeamento → ir para prévia ──────────────────────────────────
  const handleApplyMapping = () => {
    if (!colData) return;

    const descIdx = mapping.indexOf('descricao');
    const codIdx = mapping.indexOf('codigo');
    const fabIdx = mapping.indexOf('cod_fabricacao');

    if (descIdx === -1 && codIdx === -1) {
      toast.error('Selecione ao menos a coluna de Descrição ou Código.');
      return;
    }

    // Calcular linha de início dos dados
    const dataStartLine = colData.hasHeader
      ? rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
          .split('\n').map(l => l.trim()).filter(Boolean)
          .findIndex(l => {
            const low = l.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
            return low.includes('descri') || low.includes('cod') || low.includes('produto') || low.includes('refer');
          }) + 1
      : 0;

    const rows = applyColumnMapping(rawText, colData.delimiter, Math.max(0, dataStartLine), descIdx, codIdx, fabIdx);

    if (rows.length === 0) {
      toast.error('Nenhum produto extraído com esse mapeamento.');
      return;
    }

    setFabWasMapped(fabIdx !== -1);
    setResult(rows);
    setStep('preview');
  };

  // ── Download ──────────────────────────────────────────────────────────────
  const handleDownload = () => {
    if (!result) return;
    const data = result.map(r => ({
      'Descrição': r.descricao,
      'Código': r.codigo,
      'Cód. Fabricação': r.cod_fabricacao,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [{ wch: 45 }, { wch: 20 }, { wch: 20 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Produtos');
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const base = fileName.replace(/\.[^.]+$/, '');
    saveAs(new Blob([out], { type: 'application/octet-stream' }), `${base}_formatado.xlsx`);
    toast.success(`${result.length} produto(s) exportados no padrão correto.`);
  };

  // ── Importar ──────────────────────────────────────────────────────────────
  const handleImport = () => {
    if (!result) return;
    const { products, count } = replaceDatabase(result);
    onImported(products);
    toast.success(`${count} produto(s) importados com sucesso.`);
    handleClose();
  };

  // ── Reset ─────────────────────────────────────────────────────────────────
  const handleClose = () => {
    onClose();
    setTimeout(() => {
      setStep('upload');
      setFileName('');
      setRawText('');
      setColData(null);
      setMapping([]);
      setResult(null);
      setFabWasMapped(false);
    }, 200);
  };

  const setRole = (colIdx: number, role: ColRole) => {
    setMapping(prev => {
      const next = [...prev];
      // Remover role anterior se já estava em outra coluna (exceto ignorar)
      if (role !== 'ignorar') {
        next.forEach((r, i) => { if (r === role && i !== colIdx) next[i] = 'ignorar'; });
      }
      next[colIdx] = role;
      return next;
    });
  };

  const preview = result?.slice(0, PREVIEW_MAX) ?? [];
  const hasMore = (result?.length ?? 0) > PREVIEW_MAX;

  // ── Step indicators ───────────────────────────────────────────────────────
  const steps = ['Upload', 'Colunas', 'Prévia'];
  const stepIdx = step === 'upload' ? 0 : step === 'mapping' ? 1 : 2;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-4xl max-h-[92vh] flex flex-col gap-4">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DatabaseZap className="w-5 h-5 text-blue-600" />
            Formatar Planilha
          </DialogTitle>
          <DialogDescription>
            Envie o arquivo, confirme quais colunas são Descrição / Código / Cód. Fabricação
            e baixe ou importe o resultado corrigido.
          </DialogDescription>
        </DialogHeader>

        {/* Steps */}
        <div className="flex items-center gap-0 text-xs">
          {steps.map((s, i) => (
            <div key={s} className="flex items-center gap-0">
              <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full font-medium transition-colors ${
                i === stepIdx
                  ? 'bg-blue-600 text-white'
                  : i < stepIdx
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-slate-100 text-slate-400'
              }`}>
                <span className="w-4 h-4 rounded-full border flex items-center justify-center text-[10px]
                  border-current font-bold">
                  {i < stepIdx ? '✓' : i + 1}
                </span>
                {s}
              </div>
              {i < steps.length - 1 && (
                <div className={`w-6 h-px mx-1 ${i < stepIdx ? 'bg-blue-300' : 'bg-slate-200'}`} />
              )}
            </div>
          ))}
        </div>

        {/* ── ETAPA 1: Upload ────────────────────────────────────────────── */}
        {step === 'upload' && (
          <div className="flex flex-col items-center gap-4 py-6">
            <div className="w-16 h-16 rounded-2xl bg-blue-50 border-2 border-dashed border-blue-200
              flex items-center justify-center">
              <Upload className="w-7 h-7 text-blue-400" />
            </div>
            <div className="text-center">
              <p className="font-medium text-foreground">Selecione a planilha a formatar</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                XLSX, CSV, PDF, DOCX, TXT — qualquer formato aceito
              </p>
            </div>
            <input ref={inputRef} type="file" accept={ACCEPTED} className="hidden" onChange={handleFile} />
            <Button onClick={() => inputRef.current?.click()} disabled={loading} className="gap-2 px-6">
              {loading
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Processando…</>
                : <><Upload className="w-4 h-4" /> Escolher arquivo</>
              }
            </Button>
          </div>
        )}

        {/* ── ETAPA 2: Mapeamento ────────────────────────────────────────── */}
        {step === 'mapping' && colData && (
          <>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 border text-xs text-muted-foreground">
              <FileSpreadsheet className="w-4 h-4 flex-shrink-0" />
              <span>
                <strong className="text-foreground">{fileName}</strong>
                {' · '}{colData.totalRows} linha(s) · delimitador{' '}
                <code className="bg-slate-200 px-1 rounded">
                  {colData.delimiter === '\t' ? 'TAB' : colData.delimiter}
                </code>
              </span>
            </div>

            <p className="text-sm text-muted-foreground -mt-1">
              Selecione o papel de cada coluna. As cores indicam como serão importadas.
            </p>

            {/* Seletores por coluna */}
            <div className="flex flex-wrap gap-2">
              {colData.headers.map((h, i) => (
                <div key={i} className="flex flex-col gap-1">
                  <span className="text-[11px] text-muted-foreground px-1 truncate max-w-[140px]" title={h}>
                    {h || `Coluna ${i + 1}`}
                  </span>
                  <div className="flex flex-col gap-0.5">
                    {(['descricao', 'codigo', 'cod_fabricacao', 'ignorar'] as ColRole[]).map(role => (
                      <button
                        key={role}
                        onClick={() => setRole(i, role)}
                        className={`px-2.5 py-1 rounded text-[11px] font-medium border transition-all text-left ${
                          mapping[i] === role
                            ? ROLE_COLORS[role] + ' ring-1 ring-inset ring-current'
                            : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        {ROLE_LABELS[role]}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Prévia do mapeamento */}
            <div className="overflow-auto rounded-lg border border-border max-h-52">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                    {colData.headers.map((h, i) => (
                      <TableHead key={i} className={`text-[11px] whitespace-nowrap ${
                        mapping[i] !== 'ignorar' ? 'font-semibold' : 'text-slate-400'
                      }`}>
                        <span className={`px-1.5 py-0.5 rounded ${
                          mapping[i] !== 'ignorar'
                            ? ROLE_COLORS[mapping[i]]
                            : ''
                        }`}>
                          {ROLE_LABELS[mapping[i]]}
                        </span>
                        <br />
                        <span className="font-normal text-muted-foreground">{h || `Col ${i + 1}`}</span>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {colData.rows.map((row, ri) => (
                    <TableRow key={ri}>
                      {row.map((cell, ci) => (
                        <TableCell key={ci} className={`text-xs max-w-[180px] truncate ${
                          mapping[ci] === 'ignorar' ? 'text-slate-400' : ''
                        }`} title={cell}>
                          {cell || '—'}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="gap-2" onClick={() => setStep('upload')}>
                <ArrowLeft className="w-4 h-4" /> Voltar
              </Button>
              <Button className="flex-1 gap-2 bg-blue-600 hover:bg-blue-700" onClick={handleApplyMapping}>
                Ver prévia <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </>
        )}

        {/* ── ETAPA 3: Prévia ────────────────────────────────────────────── */}
        {step === 'preview' && result && (
          <>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-700">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>
                <strong>{result.length}</strong> produto(s) prontos para importar
                {hasMore && ` — mostrando os primeiros ${PREVIEW_MAX}`}
              </span>
            </div>

            {!fabWasMapped && (
              <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700">
                <span className="mt-0.5">⚡</span>
                <span>
                  Nenhuma coluna de <strong>Cód. Fabricação</strong> foi mapeada.
                  Quando o código estava no final da descrição, foi extraído automaticamente
                  — verifique a coluna <strong>Cód. Fabricação</strong> abaixo.
                </span>
              </div>
            )}

            <div className="flex-1 overflow-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                    <TableHead className="w-10 text-center text-xs">#</TableHead>
                    <TableHead className="text-xs">Descrição</TableHead>
                    <TableHead className="text-xs">Código</TableHead>
                    <TableHead className="text-xs">Cód. Fabricação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.map((r, i) => {
                    const fabAutoExtracted = !fabWasMapped && !!r.cod_fabricacao;
                    return (
                      <TableRow key={i}>
                        <TableCell className="text-center text-xs text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="text-sm font-medium max-w-[260px] truncate" title={r.descricao}>
                          {r.descricao || <span className="text-muted-foreground italic">—</span>}
                        </TableCell>
                        <TableCell className="font-mono text-sm text-muted-foreground">
                          {r.codigo || <span className="italic">—</span>}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {r.cod_fabricacao
                            ? (
                              <span className={fabAutoExtracted
                                ? 'text-amber-700 font-medium'
                                : 'text-emerald-700 font-medium'
                              }>
                                {r.cod_fabricacao}
                                {fabAutoExtracted && (
                                  <span className="ml-1 text-[10px] text-amber-500" title="Extraído do final da descrição">
                                    ↑desc
                                  </span>
                                )}
                              </span>
                            )
                            : <span className="text-muted-foreground italic">—</span>
                          }
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {hasMore && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-xs text-muted-foreground py-2">
                        … e mais {result.length - PREVIEW_MAX} produto(s)
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="gap-2" onClick={() => setStep('mapping')}>
                <ArrowLeft className="w-4 h-4" /> Ajustar colunas
              </Button>
              <Button variant="outline" className="gap-2" onClick={handleDownload}>
                <Download className="w-4 h-4" /> Baixar (.xlsx)
              </Button>
              <Button className="flex-1 gap-2 bg-blue-600 hover:bg-blue-700" onClick={handleImport}>
                <FileSpreadsheet className="w-4 h-4" /> Importar como banco de dados
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
