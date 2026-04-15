/**
 * store.ts
 * Persistência via localStorage.
 * Estrutura preparada para migrar para Supabase facilmente.
 */

import type { Product, ParsedRow } from '@/types/product';

const DB_KEY = 'consulta-produtos-db-v2';

// ─── Leitura ─────────────────────────────────────────────────────────────────

export function loadProducts(): Product[] {
  try {
    const raw = localStorage.getItem(DB_KEY);
    return raw ? (JSON.parse(raw) as Product[]) : [];
  } catch {
    return [];
  }
}

// ─── Escrita ─────────────────────────────────────────────────────────────────

function saveProducts(products: Product[]): void {
  localStorage.setItem(DB_KEY, JSON.stringify(products));
}

// ─── Substituir base completa ────────────────────────────────────────────────

export function replaceDatabase(rows: ParsedRow[]): {
  products: Product[];
  count: number;
} {
  const seen = new Set<string>();
  const products: Product[] = [];

  for (const r of rows) {
    const key = (r.codigo || r.cod_fabricacao).trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    products.push({
      ...r,
      id: crypto.randomUUID(),
      addedAt: new Date().toISOString(),
      status: 'pendente',
      order: products.length,
    });
  }

  saveProducts(products);
  return { products, count: products.length };
}

// ─── Marcar como cadastrado (arquivo de atualização) ─────────────────────────

export function markAsCadastrado(
  existing: Product[],
  matchCodes: string[]
): { products: Product[]; updated: number } {
  const codeSet = new Set(matchCodes.map((c) => c.trim().toLowerCase()));
  let updated = 0;

  const products = existing.map((p) => {
    const codigos = [p.codigo, p.cod_fabricacao].map((c) => c.trim().toLowerCase());
    const matches = codigos.some((c) => c && codeSet.has(c));
    if (matches && p.status === 'pendente') {
      updated++;
      return { ...p, status: 'cadastrado' as const };
    }
    return p;
  });

  saveProducts(products);
  return { products, updated };
}

// ─── Limpar ───────────────────────────────────────────────────────────────────

export function clearDatabase(): void {
  localStorage.removeItem(DB_KEY);
}

// ─── Exportação CSV ───────────────────────────────────────────────────────────

export function exportCsv(products: Product[]): string {
  const header = 'Descrição;Código;Código de Fabricação;Status';
  const rows = products.map(
    (p) =>
      `"${p.descricao}";"${p.codigo}";"${p.cod_fabricacao}";"${p.status}"`
  );
  return [header, ...rows].join('\n');
}
