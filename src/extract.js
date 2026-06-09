// Turn a file into plain text for indexing, dispatching by extension.
import fs from 'node:fs';
import path from 'node:path';
import { extractPdfText } from './pdf.js';

const ENTITIES = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'" };

export function htmlToText(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/h[1-6]|\/li)\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/&[a-z]+;|&#39;|&apos;/gi, (e) => ENTITIES[e.toLowerCase()] ?? e)
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function extractText(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.pdf') return extractPdfText(fs.readFileSync(file));
  const raw = fs.readFileSync(file, 'utf8');
  if (ext === '.html' || ext === '.htm' || ext === '.xhtml') return htmlToText(raw);
  return raw;
}
