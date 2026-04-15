/**
 * matching.ts
 * Estratégia de cruzamento em duas camadas:
 *  1. Exato   – token normalizado (rápido, 100% confiança)
 *  2. Fuzzy   – Fuse.js na descrição + cod_fabricacao (tolerante a variações)
 */

import Fuse from 'fuse.js';
import type { Product, BudgetItem, ParsedRow } from '@/types/product';
import { isLocationCode, isNcmCode } from '@/lib/extractor';

// ─── Normalização de tokens ───────────────────────────────────────────────────

function normalizeToken(v: string): string {
  return v
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function isPriceLike(v: string): boolean {
  const c = v.trim().replace(/\s/g, '');
  return /^\d{1,3}([.,]\d{3})*[.,]\d{2}$/.test(c) || /^\d+[.,]\d{2}$/.test(c);
}

function isSmallCount(v: string): boolean {
  return /^(\*+)?\d{1,3}$/.test(v.trim());
}

/**
 * Extrai todos os tokens de código de uma string.
 * Ex: "PARAFUSO HEX 3/8 N410874" → ["parafuso", "hex", "38", "n410874"]
 */
function extractTokens(v: string): string[] {
  const trimmed = v.trim().toLowerCase();
  if (!trimmed) return [];
  if (isLocationCode(v) || isNcmCode(v)) return [];

  const tokens: string[] = [];

  // Token completo normalizado
  const compact = normalizeToken(trimmed);
  if (compact.length >= 3 && compact.length <= 30) tokens.push(compact);

  // Tokens individuais por separadores
  for (const part of trimmed.split(/[\s,;/]+/)) {
    const raw = part.trim();
    if (!raw || raw.length < 3) continue;
    if (/^\d{1,3}([.,]\d{3})*[.,]\d{2}$/.test(raw)) continue; // preço
    if (isPriceLike(raw) || isSmallCount(raw)) continue;

    const cleaned = normalizeToken(raw);
    const hasLetters = /[a-z]/.test(cleaned);
    const digits = cleaned.replace(/\D/g, '').length;
    if (hasLetters && digits >= 1 && cleaned.length <= 25) tokens.push(cleaned);
    else if (!hasLetters && digits >= 4) tokens.push(cleaned);
  }

  return [...new Set(tokens)];
}

function isRealDescription(v: string): boolean {
  const t = v.trim();
  if (!t || t.length < 3 || !/[a-zA-ZÀ-ÿ]/.test(t)) return false;
  if (/\s/.test(t) && t.length >= 5) return true;
  const compact = t.replace(/[-/.\s]/g, '');
  return !/\d/.test(compact) && compact.length >= 5;
}

function looksLikeCode(v: string): boolean {
  const t = v.trim();
  if (!t || t.length < 2) return false;
  const compact = t.replace(/[-/.\s]/g, '');
  const hasLetters = /[a-z]/i.test(compact);
  const hasDigits = /\d/.test(compact);
  if (hasLetters && hasDigits && compact.length >= 2 && compact.length <= 25) return true;
  if (!hasLetters && hasDigits && compact.replace(/\D/g, '').length >= 4) return true;
  return false;
}

// ─── Cruzamento principal ────────────────────────────────────────────────────

export interface MatchResult {
  encontrado: boolean;
  matchScore: number;
  matchedBy?: 'exato' | 'fuzzy' | 'descricao';
  matchedProduct?: Product;
}

function normalizeBudgetItem(item: ParsedRow): ParsedRow {
  const descricao =
    (isRealDescription(item.descricao) ? item.descricao : '') ||
    (isRealDescription(item.codigo) ? item.codigo : '') ||
    (isRealDescription(item.cod_fabricacao) ? item.cod_fabricacao : '') ||
    item.descricao;

  let cod_fabricacao = '';
  for (const c of [item.cod_fabricacao, item.codigo, item.descricao]) {
    if (looksLikeCode(c) && c.trim() !== descricao.trim()) {
      cod_fabricacao = c;
      break;
    }
  }
  if (!cod_fabricacao) cod_fabricacao = item.cod_fabricacao;

  return { ...item, descricao, cod_fabricacao };
}

export function analyzeAgainstDatabase(
  budgetItems: ParsedRow[],
  database: Product[],
  fuzzyThreshold = 0.72 // 0–1 (Fuse.js: menor = mais estrito)
): BudgetItem[] {
  // ── Camada 1: Mapa de tokens exatos ─────────────────────────────────────────
  const tokenMap = new Map<string, Product>();
  const descMap = new Map<string, Product>();

  for (const p of database) {
    for (const token of extractTokens(p.cod_fabricacao)) tokenMap.set(token, p);
    for (const token of extractTokens(p.codigo)) tokenMap.set(token, p);
    const descKey = p.descricao.trim().toLowerCase();
    if (descKey) descMap.set(descKey, p);
  }

  // ── Camada 2: Fuse.js fuzzy ──────────────────────────────────────────────────
  const fuse = new Fuse(database, {
    keys: [
      { name: 'descricao', weight: 0.5 },
      { name: 'cod_fabricacao', weight: 0.35 },
      { name: 'codigo', weight: 0.15 },
    ],
    includeScore: true,
    threshold: 1 - fuzzyThreshold, // Fuse: score 0=perfeito, 1=horrível
    ignoreLocation: true,
    minMatchCharLength: 3,
  });

  return budgetItems.map((raw) => {
    const item = normalizeBudgetItem(raw);

    // ── Exato ─────────────────────────────────────────────────────────────────
    const budgetTokens = [
      ...extractTokens(raw.cod_fabricacao),
      ...extractTokens(raw.codigo),
      ...extractTokens(raw.descricao),
    ];

    for (const token of budgetTokens) {
      const match = tokenMap.get(token);
      if (match) {
        const descricao = isRealDescription(raw.descricao)
          ? raw.descricao
          : isRealDescription(raw.codigo)
          ? raw.codigo
          : match.descricao;
        return {
          ...item,
          descricao,
          cod_fabricacao: match.cod_fabricacao || item.cod_fabricacao,
          encontrado: true,
          matchScore: 100,
          matchedBy: 'exato' as const,
          matchedProduct: match,
        };
      }
    }

    // ── Descrição exata ────────────────────────────────────────────────────────
    const descKey = raw.descricao.trim().toLowerCase();
    if (descKey && descMap.has(descKey)) {
      const match = descMap.get(descKey)!;
      return { ...item, encontrado: true, matchScore: 95, matchedBy: 'descricao' as const, matchedProduct: match };
    }

    // ── Fuzzy ──────────────────────────────────────────────────────────────────
    const query = [raw.descricao, raw.cod_fabricacao, raw.codigo].filter(Boolean).join(' ');
    if (query.trim().length >= 4) {
      const results = fuse.search(query);
      if (results.length > 0 && results[0].score !== undefined) {
        const fuseScore = results[0].score; // 0=perfeito
        const matchScore = Math.round((1 - fuseScore) * 100);
        if (matchScore >= fuzzyThreshold * 100) {
          const match = results[0].item;
          return {
            ...item,
            encontrado: true,
            matchScore,
            matchedBy: 'fuzzy' as const,
            matchedProduct: match,
          };
        }
      }
    }

    return { ...item, encontrado: false, matchScore: 0 };
  });
}
