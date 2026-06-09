// Read text files and split them into citable chunks with line ranges and
// extracted timestamps. Zero deps.
import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_EXTS = new Set(['.md', '.markdown', '.txt', '.text', '.org', '.rst']);
const SKIP_DIRS = new Set(['.git', 'node_modules', '.engram', '.obsidian', 'dist', 'build']);

export function walkFiles(targets, exts = DEFAULT_EXTS) {
  const files = [];
  const visit = (p) => {
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      if (SKIP_DIRS.has(path.basename(p))) return;
      for (const name of fs.readdirSync(p)) {
        if (name.startsWith('.') && name !== '.') {
          // allow explicitly-passed hidden files, but skip hidden during walk
          continue;
        }
        visit(path.join(p, name));
      }
    } else if (exts.has(path.extname(p).toLowerCase())) {
      files.push(p);
    }
  };
  for (const t of targets) {
    if (!fs.existsSync(t)) throw new Error(`path not found: ${t}`);
    visit(path.resolve(t));
  }
  return files;
}

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

// Find the first plausible date in a string; return ISO yyyy-mm-dd or null.
export function extractDate(text) {
  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) {
    const [, y, m, d] = iso;
    if (+m >= 1 && +m <= 12 && +d >= 1 && +d <= 31) return `${y}-${m}-${d}`;
  }
  const named = text.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})\b/);
  if (named) {
    const mo = MONTHS[named[1].slice(0, 3).toLowerCase()];
    if (mo) return `${named[3]}-${String(mo).padStart(2, '0')}-${String(named[2]).padStart(2, '0')}`;
  }
  return null;
}

/**
 * Split file text into chunks. Greedy: accumulate paragraphs (blank-line
 * separated), starting a fresh chunk at headings or when a size cap is hit.
 */
export function chunkText(text, { maxChars = 900, minChars = 200 } = {}) {
  const lines = text.split(/\r?\n/);
  const chunks = [];
  let buf = [];
  let startLine = 1;
  let len = 0;

  const flush = (endLine) => {
    const body = buf.join('\n').trim();
    if (body) chunks.push({ text: body, startLine, endLine, date: extractDate(body) });
    buf = [];
    len = 0;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNo = i + 1;
    const isHeading = /^#{1,6}\s/.test(line);

    if (isHeading && len >= minChars) {
      flush(lineNo - 1);
      startLine = lineNo;
    }
    if (buf.length === 0) startLine = lineNo;
    buf.push(line);
    len += line.length + 1;

    const blank = line.trim() === '';
    if ((blank && len >= maxChars) || len >= maxChars * 1.6) {
      flush(lineNo);
      startLine = lineNo + 1;
    }
  }
  flush(lines.length);
  return chunks;
}

export function chunkFile(file, opts) {
  const text = fs.readFileSync(file, 'utf8');
  const mtime = fs.statSync(file).mtime.toISOString();
  const chunks = chunkText(text, opts).map((c) => ({
    ...c,
    source: file,
    mtime,
    // best-effort moment this memory refers to: in-text date wins over file mtime
    when: c.date ? c.date + 'T00:00:00.000Z' : mtime,
  }));
  return { source: file, mtime, chunks };
}
