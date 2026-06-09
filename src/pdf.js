// Zero-dependency, best-effort PDF text extraction. Handles the common case:
// text in FlateDecode'd (or raw) content streams using standard/WinAnsi-encoded
// fonts. Built on Node's zlib only.
//
// Honest limits: scanned PDFs (no text layer), encrypted PDFs, and documents
// using CID/Type0 fonts with custom encodings will extract poorly or not at all.
import zlib from 'node:zlib';

function decodeHex(hex) {
  let out = '';
  const h = hex.replace(/[^0-9a-fA-F]/g, '');
  for (let i = 0; i < h.length; i += 2) out += String.fromCharCode(parseInt(h.substr(i, 2).padEnd(2, '0'), 16));
  return out;
}

// Decode a PDF literal string body (the bytes between the outer parens), honoring
// backslash escapes and \ooo octal codes.
function decodePdfString(s) {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch !== '\\') {
      out += ch;
      continue;
    }
    const n = s[i + 1];
    if (n === 'n') (out += '\n'), i++;
    else if (n === 'r') (out += '\r'), i++;
    else if (n === 't') (out += '\t'), i++;
    else if (n === 'b') (out += '\b'), i++;
    else if (n === 'f') (out += '\f'), i++;
    else if (n === '(' || n === ')' || n === '\\') (out += n), i++;
    else if (n === '\n') i++; // line continuation
    else if (n === '\r') i += s[i + 2] === '\n' ? 2 : 1;
    else if (n >= '0' && n <= '7') {
      let oct = n;
      i++;
      for (let k = 0; k < 2 && s[i + 1] >= '0' && s[i + 1] <= '7'; k++) oct += s[++i];
      out += String.fromCharCode(parseInt(oct, 8) & 0xff);
    } else (out += n), i++;
  }
  return out;
}

// Pull text out of one decoded content stream. We only read string operands and
// add line breaks on text-positioning operators — everything else is skipped.
function extractFromContent(content) {
  let out = '';
  const n = content.length;
  let i = 0;
  while (i < n) {
    const ch = content[i];
    if (ch === '(') {
      let depth = 1;
      let j = i + 1;
      let raw = '';
      while (j < n && depth > 0) {
        const c = content[j];
        if (c === '\\') {
          raw += c + (content[j + 1] || '');
          j += 2;
          continue;
        }
        if (c === '(') depth++;
        else if (c === ')') {
          depth--;
          if (depth === 0) {
            j++;
            break;
          }
        }
        raw += c;
        j++;
      }
      out += decodePdfString(raw);
      i = j;
    } else if (ch === '<' && content[i + 1] !== '<') {
      const close = content.indexOf('>', i + 1);
      if (close < 0) break;
      out += decodeHex(content.slice(i + 1, close));
      i = close + 1;
    } else if (ch === 'T' && (content[i + 1] === '*' || content[i + 1] === 'd' || content[i + 1] === 'D')) {
      out += '\n'; // T*, Td, TD — new text line
      i += 2;
    } else {
      i++;
    }
  }
  return out;
}

function tryInflate(buf) {
  // PDFs put an EOL before `endstream` that isn't part of the data — try a couple
  // of trailing-byte trims, and both zlib and raw-deflate.
  for (const b of [buf, buf.subarray(0, buf.length - 1), buf.subarray(0, buf.length - 2)]) {
    try {
      return zlib.inflateSync(b).toString('latin1');
    } catch {}
    try {
      return zlib.inflateRawSync(b).toString('latin1');
    } catch {}
  }
  return null;
}

export function extractPdfText(buffer) {
  const data = Buffer.isBuffer(buffer) ? buffer.toString('latin1') : String(buffer);
  let text = '';
  const streamRe = /stream(\r\n|\r|\n)/g;
  let m;
  while ((m = streamRe.exec(data))) {
    const start = m.index + m[0].length;
    const end = data.indexOf('endstream', start);
    if (end < 0) break;
    const slice = Buffer.from(data.slice(start, end), 'latin1');
    const content = tryInflate(slice) || data.slice(start, end);
    // Only mine actual content streams — skip image/font/binary streams so we
    // don't emit garbage from random '(' bytes.
    if (/BT|Tj|TJ/.test(content)) text += extractFromContent(content) + '\n';
    streamRe.lastIndex = end + 'endstream'.length;
  }
  return text
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
