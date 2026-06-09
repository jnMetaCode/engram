// Parse a "when" string: ISO dates plus friendly relatives (7d, week, today…).
// Returns an ISO string, or undefined for empty input. Throws on garbage.
export function parseSince(v, nowMs = Date.now()) {
  if (!v) return undefined;
  const DAY = 86400000;
  const rel = { today: 0, yesterday: 1, week: 7, 'last-week': 7, month: 30, year: 365 };
  if (v in rel) return new Date(nowMs - rel[v] * DAY).toISOString();
  const m = String(v).match(/^(\d+)\s*([dwmy])$/);
  if (m) {
    const mult = { d: 1, w: 7, m: 30, y: 365 }[m[2]];
    return new Date(nowMs - Number(m[1]) * mult * DAY).toISOString();
  }
  const t = Date.parse(v);
  if (Number.isNaN(t)) throw new Error(`could not parse date: ${v}`);
  return new Date(t).toISOString();
}
