// Zero-dependency, best-effort EPUB text extraction. An EPUB is a ZIP of
// XHTML chapters plus an OPF manifest that defines reading order (the spine).
// We parse the ZIP central directory with Node's zlib only, read the OPF to
// get spine order when possible, and fall back to filename order.
//
// Honest limits: DRM'd EPUBs and exotic containers won't extract.
import zlib from 'node:zlib';
import { htmlToText } from './extract.js';

const EOCD_SIG = 0x06054b50; // end of central directory
const CEN_SIG = 0x02014b50; // central directory file header
const LOC_SIG = 0x04034b50; // local file header

/** Parse the ZIP central directory → [{ name, method, offset, compSize }] */
function zipEntries(buf) {
  // EOCD is within the last 64KB+22 bytes (comment can pad it)
  const start = Math.max(0, buf.length - 65557);
  let eocd = -1;
  for (let i = buf.length - 22; i >= start; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a zip/epub (no end-of-central-directory)');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16); // central directory offset
  const entries = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== CEN_SIG) break;
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const offset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    entries.push({ name, method, offset, compSize });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** Read and decompress one entry's bytes. */
function readEntry(buf, entry) {
  const p = entry.offset;
  if (buf.readUInt32LE(p) !== LOC_SIG) throw new Error(`bad local header for ${entry.name}`);
  const nameLen = buf.readUInt16LE(p + 26);
  const extraLen = buf.readUInt16LE(p + 28);
  const dataStart = p + 30 + nameLen + extraLen;
  const data = buf.subarray(dataStart, dataStart + entry.compSize);
  if (entry.method === 0) return data; // stored
  if (entry.method === 8) return zlib.inflateRawSync(data); // deflate
  throw new Error(`unsupported zip method ${entry.method} for ${entry.name}`);
}

const dirOf = (p) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/') + 1) : '');

/** Resolve spine order from the OPF manifest; null when not derivable. */
function spineOrder(buf, entries) {
  const opf = entries.find((e) => e.name.toLowerCase().endsWith('.opf'));
  if (!opf) return null;
  let xml;
  try {
    xml = readEntry(buf, opf).toString('utf8');
  } catch {
    return null;
  }
  const items = new Map(); // id -> href
  for (const m of xml.matchAll(/<item\b[^>]*>/g)) {
    const id = m[0].match(/\bid\s*=\s*"([^"]+)"/)?.[1];
    const href = m[0].match(/\bhref\s*=\s*"([^"]+)"/)?.[1];
    if (id && href) items.set(id, href);
  }
  const base = dirOf(opf.name);
  const order = [];
  for (const m of xml.matchAll(/<itemref\b[^>]*\bidref\s*=\s*"([^"]+)"/g)) {
    const href = items.get(m[1]);
    if (href) order.push(base + decodeURIComponent(href));
  }
  return order.length ? order : null;
}

const isChapter = (n) => /\.(xhtml|html|htm)$/i.test(n);

export function extractEpubText(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const entries = zipEntries(buf);
  const byName = new Map(entries.map((e) => [e.name, e]));
  const ordered =
    spineOrder(buf, entries)
      ?.map((n) => byName.get(n))
      .filter((e) => e && isChapter(e.name)) ||
    entries.filter((e) => isChapter(e.name)).sort((a, b) => a.name.localeCompare(b.name));
  const parts = [];
  for (const e of ordered) {
    try {
      parts.push(htmlToText(readEntry(buf, e).toString('utf8')));
    } catch {
      /* skip unreadable chapter rather than failing the book */
    }
  }
  return parts.filter(Boolean).join('\n\n').trim();
}
