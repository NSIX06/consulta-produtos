export interface Product {
  id: string;
  descricao: string;
  codigo: string;
  cod_fabricacao: string;
  addedAt: string;
  status: 'pendente' | 'cadastrado';
  order?: number; // posição original na planilha importada
}

export interface BudgetItem {
  descricao: string;
  codigo: string;
  cod_fabricacao: string;
  encontrado: boolean;
  matchScore?: number;           // 0–100, só quando encontrado=true
  matchedBy?: 'exato' | 'fuzzy' | 'descricao';
  matchedProduct?: Product;      // produto do banco que foi encontrado
}

export interface ParsedRow {
  descricao: string;
  codigo: string;
  cod_fabricacao: string;
}

export type SortField = 'descricao' | 'codigo' | 'cod_fabricacao' | 'original';
export type SortDirection = 'asc' | 'desc';
