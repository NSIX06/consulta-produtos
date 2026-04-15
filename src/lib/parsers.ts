/**
 * parsers.ts
 * Extração de texto de diferentes formatos de arquivo.
 * Suporta: PDF, DOCX, XLSX/XLS, CSV, TXT, JPEG/PNG (OCR)
 */

// ─── PDF ────────────────────────────────────────────────────────────────────

export async function parsePdf(file: File): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist');
  const workerUrl = new URL(
    'pdfjs-dist/build/pdf.worker.mjs',
    import.meta.url
  ).href;
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const rows: string[] = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const items = content.items as Array<{
      str: string;
      transform: number[];
      width: number;
    }>;

    if (!items.length) continue;

    // Agrupar por posição Y (mesma linha) com tolerância de 3px
    const lineMap = new Map<number, Array<{ x: number; text: string; width: number }>>();
    const TOL = 3;

    for (const item of items) {
      if (!item.str.trim()) continue;
      const y = Math.round(item.transform[5] / TOL) * TOL;
      if (!lineMap.has(y)) lineMap.set(y, []);
      lineMap.get(y)!.push({ x: item.transform[4], text: item.str, width: item.width ?? 0 });
    }

    // Ordenar linhas de cima para baixo (Y decrescente no PDF)
    const sortedYs = [...lineMap.keys()].sort((a, b) => b - a);

    for (const y of sortedYs) {
      const cells = lineMap.get(y)!.sort((a, b) => a.x - b.x);

      // Mesclar células muito próximas usando a largura real do item (item.width)
      // Gap > 6 unidades PDF = tokens distintos de colunas diferentes
      const merged: Array<{ x: number; text: string; width: number }> = [];
      for (const cell of cells) {
        if (merged.length > 0) {
          const last = merged[merged.length - 1];
          const lastEnd = last.x + (last.width > 0 ? last.width : last.text.length * 6);
          const gap = cell.x - lastEnd;
          if (gap < 6) {
            // Espaço entre palavras dentro do mesmo token
            last.text += (gap > 1 ? ' ' : '') + cell.text;
            last.width = (cell.x + (cell.width > 0 ? cell.width : cell.text.length * 6)) - last.x;
            continue;
          }
        }
        merged.push({ ...cell });
      }

      const rowText = merged.map((c) => c.text.trim()).join(';');
      if (rowText.trim()) rows.push(rowText);
    }
  }

  return rows.join('\n');
}

// ─── DOCX ───────────────────────────────────────────────────────────────────

export async function parseDocx(file: File): Promise<string> {
  const mammoth = await import('mammoth');
  const buffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  return result.value;
}

// ─── XLSX / XLS ─────────────────────────────────────────────────────────────

export async function parseXlsx(file: File): Promise<string> {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const parts: string[] = [];

  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    const csv = XLSX.utils.sheet_to_csv(sheet, { FS: ';' });
    parts.push(csv);
  }

  return parts.join('\n');
}

// ─── CSV / TXT ──────────────────────────────────────────────────────────────

export async function parseText(file: File): Promise<string> {
  return file.text();
}

// ─── IMAGEM (OCR) ───────────────────────────────────────────────────────────

export async function parseImage(file: File): Promise<string> {
  const Tesseract = await import('tesseract.js');
  const result = await Tesseract.recognize(file, 'por', { logger: () => {} });
  return result.data.text;
}

// ─── DISPATCHER ─────────────────────────────────────────────────────────────

export async function parseFile(file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const type = file.type;

  if (ext === 'pdf' || type === 'application/pdf') return parsePdf(file);

  if (
    ext === 'docx' ||
    type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )
    return parseDocx(file);

  if (
    ext === 'xlsx' ||
    ext === 'xls' ||
    type.includes('spreadsheet') ||
    type.includes('excel')
  )
    return parseXlsx(file);

  if (ext === 'csv' || ext === 'txt' || type.startsWith('text/'))
    return parseText(file);

  if (
    ['jpeg', 'jpg', 'png', 'tiff', 'tif', 'bmp', 'webp'].includes(ext) ||
    type.startsWith('image/')
  )
    return parseImage(file);

  throw new Error(`Formato não suportado: .${ext}`);
}
