# Consulta de Produtos Cadastrados v2

Sistema de cruzamento de orçamentos com base de produtos cadastrados.

## Stack

- **React 18 + TypeScript + Vite**
- **TailwindCSS + shadcn/ui** (componentes customizados)
- **pdfjs-dist** — extração de texto de PDFs digitais
- **mammoth** — extração de texto de DOCX
- **xlsx (SheetJS)** — leitura de planilhas .xlsx / .xls
- **tesseract.js** — OCR em imagens (JPEG, PNG, TIFF)
- **Fuse.js** — fuzzy matching (tolerância a variações de texto)
- **sonner** — notificações toast

## Instalação

```bash
npm install
npm run dev
```

## Como usar

### 1. Upload de Arquivos (banco de dados)
Envie a planilha/PDF com os produtos cadastrados.  
O sistema detecta automaticamente as colunas de **Descrição**, **Código** e **Cód. Fabricação**.

### 2. Analisar Orçamento
Envie o arquivo de orçamento. O sistema cruza cada item com a base usando:
- **Match Exato**: token normalizado (sem acentos, minúsculas, sem separadores)
- **Match Fuzzy**: Fuse.js com threshold de 72% de similaridade
- **Match por Descrição**: descrição exata (case-insensitive)

### 3. Atualizar Cadastrados
Envie um arquivo com os itens já cadastrados no sistema para marcar o status.

### 4. Exportação
- **CSV**: planilha separada por `;` com BOM UTF-8
- **Excel**: `.xlsx` formatado
- **Relatório de Análise**: planilha completa com tipo de match e score

## Formatos suportados

| Formato | Extensões |
|---------|-----------|
| PDF digital | `.pdf` |
| Word | `.docx` |
| Excel | `.xlsx`, `.xls` |
| Texto | `.txt`, `.csv` |
| Imagem (OCR) | `.jpeg`, `.jpg`, `.png`, `.tiff`, `.tif` |

## Arquitetura

```
src/
├── lib/
│   ├── parsers.ts     → Extração de texto por formato
│   ├── extractor.ts   → Heurísticas de detecção de colunas
│   ├── matching.ts    → Match exato + Fuse.js fuzzy
│   └── store.ts       → localStorage (preparado para Supabase)
├── components/
│   ├── Sidebar.tsx
│   ├── ProductTable.tsx
│   └── BudgetTable.tsx
└── pages/
    └── Index.tsx
```

## Migração para Supabase

Para migrar o `store.ts` para Supabase, instale `@supabase/supabase-js`
e substitua as funções de `localStorage` por chamadas ao client Supabase.
A interface de tipos (`Product`, `ParsedRow`) permanece a mesma.
