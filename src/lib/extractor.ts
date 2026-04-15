/**
 * extractor.ts
 * Heurísticas para extrair produtos e itens de orçamento de texto bruto.
 * Suporta arquivos com ou sem cabeçalho, múltiplos delimitadores.
 */

import type { ParsedRow } from '@/types/product';

// ─── Helpers de classificação de célula ─────────────────────────────────────

/** Código de localização/prateleira: EE-046, B-073, FF-040 */
export function isLocationCode(v: string): boolean {
  return /^[A-Za-z]{1,2}[-\s]?\d{2,3}$/i.test(v.trim());
}

/** Código NCM (8 dígitos) */
export function isNcmCode(v: string): boolean {
  return /^\d{8}$/.test(v.trim().replace(/[.\s]/g, ''));
}

function isPriceLike(v: string): boolean {
  const c = v.trim().replace(/\s/g, '');
  return /^\d{1,3}([.,]\d{3})*[.,]\d{2}$/.test(c) || /^\d+[.,]\d{2}$/.test(c);
}

function isSmallCount(v: string): boolean {
  return /^(\*+)?\d{1,3}$/.test(v.trim());
}

function isAlphaDesc(v: string): boolean {
  const c = v.trim();
  if (!c) return false;
  if (isLocationCode(c) || isNcmCode(c) || isPriceLike(c) || isSmallCount(c)) return false;
  const compact = c.replace(/[-/.\\s]/g, '');
  const letters = (compact.match(/[A-Za-zÀ-ÿ]/g) ?? []).length;
  const digits = (compact.match(/\d/g) ?? []).length;
  if (!letters) return false;
  if (/\s/.test(c)) return letters >= Math.max(2, digits);
  // Descrição de uma palavra: aceita sem dígitos, ou com poucos dígitos mas letras dominantes
  if (compact.length < 4) return false;
  if (digits === 0) return true;
  return letters >= 3 && letters > digits;
}

function isFabCode(v: string): boolean {
  const c = v.trim();
  if (!c || /\s/.test(c) || /:/.test(c)) return false;
  if (isLocationCode(c) || isNcmCode(c) || isPriceLike(c) || isSmallCount(c)) return false;
  const compact = c.replace(/[-/.]/g, '');
  const digits = compact.replace(/\D/g, '').length;
  const hasLetters = /[A-Za-z]/.test(compact);
  if (hasLetters && digits > 0 && compact.length >= 3 && compact.length <= 25) return true;
  if (!hasLetters && digits >= 4 && digits <= 7) return true;
  return false;
}

function isStoredCode(v: string): boolean {
  const c = v.trim();
  if (!c || /\s/.test(c)) return false;
  if (isLocationCode(c) || isNcmCode(c) || isPriceLike(c) || isSmallCount(c)) return false;
  const compact = c.replace(/[-/.]/g, '');
  const digits = compact.replace(/\D/g, '').length;
  const hasLetters = /[A-Za-z]/.test(compact);
  if (!hasLetters && digits >= 5) return true;
  if (hasLetters && digits >= 2 && compact.length >= 4 && compact.length <= 25) return true;
  return false;
}

function isMetaLabel(v: string): boolean {
  const lower = v.trim().toLowerCase();
  if (/:/.test(lower)) return true;
  if (/\b(s\.?a\.?|ltda|eireli|me|epp)\b/i.test(lower)) return true;
  return false;
}

function isIgnoredHeader(h: string): boolean {
  const n = h.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return (
    n.includes('localiz') || n.includes('posic') || n.includes('pratel') ||
    n.includes('ncm') || n.includes('qtd') || n.includes('quant') ||
    n.includes('valor') || n.includes('preco') || n.includes('unit') ||
    n.includes('cond') || n === 'item' || n === 'itens'
  );
}

function isFabHeader(h: string): boolean {
  const n = h.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return n.includes('fabric') || n.includes('cod fab') || n.includes('cod.fab') || n === 'fab';
}

// ─── Scoring de células ──────────────────────────────────────────────────────

function scoreDesc(c: string): number {
  if (!c.trim()) return -Infinity;
  if (isLocationCode(c) || isNcmCode(c) || isPriceLike(c) || isSmallCount(c)) return -10;
  let s = 0;
  if (/[A-Za-zÀ-ÿ]/.test(c)) s += 3;
  if (/\s/.test(c)) s += 4;
  if (isAlphaDesc(c)) s += 5;
  if (c.length > 12) s += 2;
  if (/^\d+$/.test(c)) s -= 6;
  if (/\d/.test(c)) s -= 2;
  if (isFabCode(c)) s -= 6;
  return s;
}

function scoreCod(c: string): number {
  if (!c.trim()) return -Infinity;
  if (isNcmCode(c) || isLocationCode(c) || isPriceLike(c) || isSmallCount(c)) return -10;
  const digits = c.replace(/\D/g, '').length;
  const hasLetters = /[A-Za-zÀ-ÿ]/.test(c);
  let s = 0;
  if (digits >= 8) s += 8;
  else if (digits >= 5) s += 4;
  if (!hasLetters && digits > 0) s += 3;
  else if (hasLetters && digits >= 2) s += 3;
  if (isAlphaDesc(c)) s -= 6;
  return s;
}

function scoreFab(c: string): number {
  if (!c.trim()) return -Infinity;
  if (isLocationCode(c) || isNcmCode(c) || isPriceLike(c) || isSmallCount(c)) return -10;
  if (isAlphaDesc(c)) return -8;
  const compact = c.trim().replace(/\s/g, '');
  const digits = compact.replace(/\D/g, '').length;
  const hasLetters = /[A-Za-z]/.test(compact);
  let s = 0;
  if (hasLetters && digits > 0) s += 7;
  else if (!hasLetters && digits >= 4 && digits <= 7) s += 4;
  if (compact.length >= 3 && compact.length <= 20) s += 2;
  if (/[-/.]/.test(c)) s += 1;
  if (/\s/.test(c)) s -= 3;
  if (!hasLetters && digits >= 8) s -= 4;
  return s;
}

function pickBest(cells: string[], scorer: (c: string, i: number) => number): number {
  let bestIdx = -1;
  let bestScore = 0;
  for (let i = 0; i < cells.length; i++) {
    const s = scorer(cells[i], i);
    if (s > bestScore) { bestScore = s; bestIdx = i; }
  }
  return bestIdx;
}

function inferRow(parts: string[]): ParsedRow | null {
  const cells = parts.map((p) => p.trim()).filter(Boolean);
  if (cells.length < 2) return null;
  if (/^\d{1,4}$/.test(cells[0])) cells.shift();
  if (cells.length < 2) return null;

  const di = pickBest(cells, scoreDesc);
  if (di === -1) return null;
  const ci = pickBest(cells, (c, i) => i === di ? -Infinity : scoreCod(c));
  const fi = pickBest(cells, (c, i) => (i === di || i === ci) ? -Infinity : scoreFab(c));

  return {
    descricao: cells[di] ?? '',
    codigo: ci !== -1 ? (cells[ci] ?? '') : '',
    cod_fabricacao: fi !== -1 ? (cells[fi] ?? '') : '',
  };
}

// ─── Normalização e sanitização ──────────────────────────────────────────────

function norm(v: string): string {
  return v.replace(/\s+/g, ' ').trim();
}

function normalizeRow(r: ParsedRow): ParsedRow {
  let { descricao, codigo, cod_fabricacao } = r;
  descricao = norm(descricao);
  codigo = norm(codigo);
  cod_fabricacao = norm(cod_fabricacao);

  // Se descrição parece código e cod_fab parece descrição, trocar
  if (isFabCode(descricao) && isAlphaDesc(cod_fabricacao)) {
    [descricao, cod_fabricacao] = [cod_fabricacao, descricao];
  }

  // Apaga codigo apenas se for claramente ruído (preço, localização, NCM, contagem)
  // Nunca apagar se for o único código disponível
  if (codigo && (isPriceLike(codigo) || isLocationCode(codigo) || isNcmCode(codigo) || isSmallCount(codigo))) {
    codigo = '';
  }
  // cod_fabricacao deve respeitar formato de código de fabricação
  if (!isFabCode(cod_fabricacao)) cod_fabricacao = '';

  return { descricao, codigo, cod_fabricacao };
}

function isValidDbProduct(r: ParsedRow): boolean {
  const d = norm(r.descricao);
  const cod = norm(r.codigo);
  const cf = norm(r.cod_fabricacao);

  // Descrição deve ter pelo menos 2 letras
  if (!d || d.length < 2 || !/[a-zA-ZÀ-ÿ]/.test(d)) return false;

  // Deve ter ao menos um código — aceita cod_fabricacao OU codigo (independentemente do formato)
  if (!cf && !cod) return false;
  if (!cf && cod.length < 2) return false;
  if (!cod && cf.length < 2) return false;

  // Filtrar linhas de ruído óbvias (totais, cabeçalhos, etc.)
  const noiseTokens = ['assinalados', 'pagamento', 'quantidade', 'total', 'subtotal', 'descricao', 'codigo', 'descri'];
  const dLower = d.toLowerCase();
  return !noiseTokens.some((t) => dLower === t || dLower.startsWith(t + ' '));
}

function isValidBudgetItem(r: ParsedRow): boolean {
  const d = norm(r.descricao);
  const cod = norm(r.codigo);
  const cf = norm(r.cod_fabricacao);
  if (isMetaLabel(d) || isMetaLabel(cod) || isMetaLabel(cf)) return false;
  const hasDesc = d.length >= 4 && /[A-Za-zÀ-ÿ]/.test(d);
  const noiseTokens = [
    'total', 'subtotal', 'desconto', 'frete', 'vendedor', 'cliente', 'cnpj',
    'endereco', 'endereço', 'observa', 'pagamento', 'valor', 'orçamento',
    'orcamento', 'maquinas', 'máquinas', 'horimetro', 'capacidade',
    'melhoramento', 'genetica', 'genética', 'tropical',
  ];
  if (hasDesc && noiseTokens.some((t) => d.toLowerCase().includes(t))) return false;

  const hasCode = (v: string) => {
    const c = v.trim();
    if (!c) return false;
    if (isLocationCode(c) || isNcmCode(c) || isPriceLike(c) || isSmallCount(c)) return false;
    const compact = c.replace(/\s/g, '');
    const digits = compact.replace(/\D/g, '').length;
    const hasLetters = /[A-Za-zÀ-ÿ]/.test(compact);
    // Aceita códigos numéricos puros a partir de 4 dígitos (ex: 0205102, 0605405)
    if (!hasLetters && digits >= 4) return true;
    if (hasLetters && digits >= 2 && compact.length >= 3 && compact.length <= 25) return true;
    return false;
  };

  // Aceita se tiver código válido OU descrição com letras
  // Mas se o campo "código" for na verdade um rótulo de rodapé (ex: "Cond. de Pagto."),
  // só aceita pelo código válido — evita capturar linhas de resumo do PDF
  const codIsLabel = cod.length > 4 && /\s/.test(cod) && !/\d/.test(cod);
  if (codIsLabel) return hasCode(cf);
  return hasCode(cod) || hasCode(cf) || hasDesc;
}

function scoreStrategy(rows: ParsedRow[]): number {
  let s = rows.length;
  for (const r of rows.slice(0, 50)) {
    if (r.descricao) s += 2;
    if (r.codigo) s += 2;
    if (r.cod_fabricacao) s += 1;
    if (/\s/.test(r.descricao) && /[A-Za-zÀ-ÿ]/.test(r.descricao)) s += 2;
    const digits = r.codigo.replace(/\D/g, '');
    if (digits.length >= 8 && !/[A-Za-z]/.test(r.codigo)) s += 3;
    if (/[A-Za-z]/.test(r.cod_fabricacao) && /\d/.test(r.cod_fabricacao)) s += 2;
  }
  return s;
}

// ─── Extração com delimitador ────────────────────────────────────────────────

function extractWithDelimiter(
  text: string,
  delimiter: RegExp,
  mode: 'db' | 'budget'
): ParsedRow[] {
  const lines = text.split('\n').filter((l) => l.trim());
  if (lines.length < 2) return [];

  // Encontrar cabeçalho (busca em até 40 linhas para PDFs com header da empresa)
  let headerIdx = -1;
  for (let i = 0; i < Math.min(lines.length, 40); i++) {
    const lower = lines[i].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const parts = lines[i].split(delimiter);
    if (parts.length >= 2 && (lower.includes('descri') || lower.includes('cod') || lower.includes('refer') || lower.includes('produto'))) {
      headerIdx = i;
      break;
    }
  }

  // Sem cabeçalho: inferir por conteúdo
  if (headerIdx === -1) {
    return lines.flatMap((l) => {
      const r = inferRow(l.split(delimiter));
      return r ? [r] : [];
    });
  }

  const headers = lines[headerIdx].split(delimiter).map((h) => h.trim().toLowerCase());
  const ignored = new Set<number>();
  for (let i = 0; i < headers.length; i++) {
    if (isIgnoredHeader(headers[i])) ignored.add(i);
  }

  let descIdx = -1;
  let codIdx = -1;
  let fabIdx = -1;

  // Normalizar headers para comparação (remove acentos)
  const normH = (h: string) => h.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  for (let i = 0; i < headers.length; i++) {
    if (ignored.has(i)) continue;
    const h = normH(headers[i]);
    if (fabIdx === -1 && isFabHeader(h)) { fabIdx = i; continue; }
    if (descIdx === -1 && (h.includes('descri') || h.includes('produto') || h.includes('nome'))) { descIdx = i; continue; }
    if (codIdx === -1 && (
      h === 'cod' || h === 'codigo' || h.match(/^c[o]d(igo)?\.?$/) ||
      h === 'ref' || h.includes('referen') || h === 'part' || h === 'peca' || h === 'no'
    )) { codIdx = i; continue; }
  }

  if (codIdx === -1) {
    for (let i = 0; i < headers.length; i++) {
      if (!ignored.has(i) && i !== fabIdx && i !== descIdx) {
        const h = normH(headers[i]);
        if (h.startsWith('cod') && !isFabHeader(h)) { codIdx = i; break; }
      }
    }
  }

  if (descIdx === -1 && codIdx === -1) return [];

  const rows: ParsedRow[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const parts = lines[i].split(delimiter).map((p) => p.trim());
    const descricao = descIdx !== -1 ? (parts[descIdx] ?? '') : '';
    const codigo = codIdx !== -1 ? (parts[codIdx] ?? '') : '';
    const cod_fabricacao = fabIdx !== -1 ? (parts[fabIdx] ?? '') : '';
    if (!descricao && !codigo) continue;
    if (descricao.toLowerCase().includes('total') || codigo.toLowerCase().includes('total')) continue;
    rows.push({ descricao, codigo, cod_fabricacao });
  }

  return rows;
}

// ─── API pública ─────────────────────────────────────────────────────────────

/**
 * Extrai produtos do banco de dados (planilha/arquivo de cadastro).
 * Espera 3 colunas: descrição, código, código de fabricação.
 */
export function extractDbProducts(text: string): ParsedRow[] {
  const cleaned = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const delimiters = [/;/, /\t/, /\|/];
  const strategies = delimiters.map((d) => () => extractWithDelimiter(cleaned, d, 'db'));

  const candidates = strategies
    .map((fn) => fn())
    .filter((r) => r.length > 0)
    .map((r) => {
      const normalized = r.map(normalizeRow);
      const filtered = normalized.filter(isValidDbProduct);
      const unique = deduplicateRows(filtered);
      return unique;
    })
    .filter((r) => r.length > 0);

  if (candidates.length === 0) return [];
  candidates.sort((a, b) => scoreStrategy(b) - scoreStrategy(a));
  return candidates[0];
}

/**
 * Extrai itens de um orçamento (flexível — colunas em qualquer ordem).
 */
export function extractBudgetItems(text: string): ParsedRow[] {
  const cleaned = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const delimiters = [/;/, /\t/, /\|/];
  const strategies = delimiters.map((d) => () => extractWithDelimiter(cleaned, d, 'budget'));

  const candidates = strategies
    .map((fn) => fn())
    .filter((r) => r.length > 0)
    .map((r) => {
      const filtered = r.filter(isValidBudgetItem);
      return deduplicateRows(filtered);
    })
    .filter((r) => r.length > 0);

  if (candidates.length === 0) return [];
  candidates.sort((a, b) => scoreStrategy(b) - scoreStrategy(a));
  return candidates[0];
}

// ─── Parse bruto de colunas (sem heurísticas) ────────────────────────────────

export interface RawColumnData {
  delimiter: string;
  headers: string[];       // nomes das colunas (ou "Coluna 1", "Coluna 2"…)
  rows: string[][];        // primeiras linhas de dados (máx 8)
  totalRows: number;       // total de linhas de dados no arquivo
  hasHeader: boolean;
}

/**
 * Detecta delimitador, cabeçalho e retorna as colunas brutas do arquivo.
 * Não aplica nenhuma heurística de conteúdo — apenas estrutura.
 */
export function parseRawColumns(text: string): RawColumnData | null {
  const cleaned = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = cleaned.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return null;

  // Detectar delimitador pela linha com mais separadores
  const delimiters = [';', '\t', '|', ','];
  let bestDel = ';';
  let bestCount = 0;
  for (const d of delimiters) {
    const count = lines.slice(0, 5).reduce((acc, l) => acc + l.split(d).length - 1, 0);
    if (count > bestCount) { bestCount = count; bestDel = d; }
  }

  if (bestCount === 0) return null; // arquivo sem delimitador

  const split = (l: string) => l.split(bestDel).map(c => c.trim());

  // Detectar linha de cabeçalho (primeiras 40 linhas)
  let headerIdx = -1;
  for (let i = 0; i < Math.min(lines.length, 40); i++) {
    const lower = lines[i].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const parts = split(lines[i]);
    if (parts.length >= 2 && (lower.includes('descri') || lower.includes('cod') || lower.includes('produto') || lower.includes('refer'))) {
      headerIdx = i;
      break;
    }
  }

  const hasHeader = headerIdx !== -1;
  const dataStart = hasHeader ? headerIdx + 1 : 0;
  const rawHeaders = hasHeader
    ? split(lines[headerIdx])
    : split(lines[0]).map((_, i) => `Coluna ${i + 1}`);

  const dataLines = lines.slice(dataStart);
  const preview = dataLines.slice(0, 8).map(split);
  const numCols = Math.max(rawHeaders.length, ...preview.map(r => r.length));

  // Garantir que headers e rows tenham mesma largura
  const headers = Array.from({ length: numCols }, (_, i) => rawHeaders[i] ?? `Coluna ${i + 1}`);
  const rows = preview.map(r => Array.from({ length: numCols }, (_, i) => r[i] ?? ''));

  return { delimiter: bestDel, headers, rows, totalRows: dataLines.length, hasHeader };
}

/**
 * Tenta extrair o código de fabricação do final da descrição.
 * Padrão: último token separado por espaço que contenha letras E dígitos
 * (ex: "ANEL DE PRESSAO 40M7043" → fab="40M7043", desc="ANEL DE PRESSAO").
 * Retorna null se nenhum token elegível for encontrado.
 */
function extractFabFromDescription(descricao: string): { desc: string; fab: string } | null {
  const trimmed = descricao.trim();
  const tokens = trimmed.split(/\s+/);
  if (tokens.length < 2) return null; // descrição de um único token — não extrair

  const last = tokens[tokens.length - 1];
  const compact = last.replace(/[-/.]/g, '');
  const hasLetters = /[A-Za-z]/.test(compact);
  const hasDigits = /\d/.test(compact);

  // Deve conter letras E dígitos, comprimento razoável, sem ser NCM (8 dígitos puros)
  if (
    hasLetters &&
    hasDigits &&
    compact.length >= 4 &&
    compact.length <= 20 &&
    !isNcmCode(last) &&
    !isPriceLike(last)
  ) {
    // Mantém a descrição completa (sem remover o código)
    return { desc: trimmed, fab: last };
  }

  return null;
}

/**
 * Aplica um mapeamento manual de colunas e retorna ParsedRow[].
 * Quando cod_fabricacao estiver vazio, tenta extrair do final da descrição.
 */
export function applyColumnMapping(
  text: string,
  delimiter: string,
  dataStartLine: number,
  descIdx: number,
  codIdx: number,
  fabIdx: number,
): ParsedRow[] {
  const cleaned = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = cleaned.split('\n').map(l => l.trim()).filter(Boolean).slice(dataStartLine);
  const split = (l: string) => l.split(delimiter).map(c => c.trim());

  const rows: ParsedRow[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const parts = split(line);
    let descricao = descIdx >= 0 ? (parts[descIdx] ?? '') : '';
    const codigo = codIdx >= 0 ? (parts[codIdx] ?? '') : '';
    let cod_fabricacao = fabIdx >= 0 ? (parts[fabIdx] ?? '') : '';

    if (!descricao && !codigo && !cod_fabricacao) continue;

    // Filtro mínimo de ruído
    const d = descricao.toLowerCase();
    if (['total', 'subtotal', 'descricao', 'descrição', 'produto'].some(t => d === t)) continue;

    // Se cod_fabricacao vazio, tenta extrair do final da descrição
    if (!cod_fabricacao && descricao) {
      const extracted = extractFabFromDescription(descricao);
      if (extracted) {
        descricao = extracted.desc;
        cod_fabricacao = extracted.fab;
      }
    }

    const key = `${descricao}|${codigo}|${cod_fabricacao}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ descricao, codigo, cod_fabricacao });
  }

  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────

function deduplicateRows(rows: ParsedRow[]): ParsedRow[] {
  const seen = new Set<string>();
  return rows.filter((r) => {
    // Inclui os três campos para não colapsar itens com mesma descrição mas códigos distintos
    const key = `${r.descricao.toLowerCase()}|${r.codigo.toLowerCase()}|${r.cod_fabricacao.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
