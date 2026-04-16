/**
 * store.ts
 * Persistência via localStorage com suporte a múltiplas marcas.
 */

import type { Product, ParsedRow } from '@/types/product';

const DB_KEY = 'consulta-produtos-db-v2';
const BRANDS_KEY = 'consulta-produtos-brands';

// ─── Marcas ───────────────────────────────────────────────────────────────────

export function loadBrands(): string[] {
  try {
    const raw = localStorage.getItem(BRANDS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as string[];
      if (parsed.length > 0) return parsed;
    }
  } catch {}
  return ['John Deere'];
}

function saveBrands(brands: string[]): void {
  localStorage.setItem(BRANDS_KEY, JSON.stringify(brands));
}

export function addBrand(name: string): string[] {
  const brands = loadBrands();
  if (brands.includes(name)) return brands;
  const updated = [...brands, name];
  saveBrands(updated);
  return updated;
}

export function removeBrand(name: string): { brands: string[]; products: Product[] } {
  const brands = loadBrands().filter((b) => b !== name);
  saveBrands(brands.length > 0 ? brands : ['John Deere']);
  const products = loadProducts().filter((p) => p.brand !== name);
  saveProducts(products);
  return { brands: brands.length > 0 ? brands : ['John Deere'], products };
}

// ─── Produtos ─────────────────────────────────────────────────────────────────

export function loadProducts(): Product[] {
  try {
    const raw = localStorage.getItem(DB_KEY);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const products = raw ? (JSON.parse(raw) as any[]) : [];
    // Migração: produtos antigos sem campo brand recebem 'John Deere'
    return products.map((p) =>
      ('brand' in p ? p : { ...p, brand: 'John Deere' })
    ) as Product[];
  } catch {
    return [];
  }
}

function saveProducts(products: Product[]): void {
  localStorage.setItem(DB_KEY, JSON.stringify(products));
}

// ─── Substituir base de uma marca ─────────────────────────────────────────────

export function replaceDatabase(
  rows: ParsedRow[],
  brand: string
): { products: Product[]; count: number } {
  const existing = loadProducts();
  const otherBrands = existing.filter((p) => p.brand !== brand);

  const seen = new Set<string>();
  const newProducts: Product[] = [];

  for (const r of rows) {
    const key = (r.codigo || r.cod_fabricacao).trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    newProducts.push({
      ...r,
      brand,
      id: crypto.randomUUID(),
      addedAt: new Date().toISOString(),
      status: 'pendente',
      order: newProducts.length,
    });
  }

  const all = [...otherBrands, ...newProducts];
  saveProducts(all);
  // Garante que a marca existe na lista
  addBrand(brand);
  return { products: all, count: newProducts.length };
}

// ─── Marcar como cadastrado ───────────────────────────────────────────────────

export function markAsCadastrado(
  brand: string,
  matchCodes: string[]
): { products: Product[]; updated: number } {
  const all = loadProducts();
  const codeSet = new Set(matchCodes.map((c) => c.trim().toLowerCase()));
  let updated = 0;

  const products = all.map((p) => {
    if (p.brand !== brand) return p;
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

export function clearDatabase(brand?: string): Product[] {
  if (brand) {
    const products = loadProducts().filter((p) => p.brand !== brand);
    saveProducts(products);
    return products;
  }
  localStorage.removeItem(DB_KEY);
  return [];
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
