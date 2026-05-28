/**
 * Best-effort pretty-printer for TypeScript source literals (object/array/call literals).
 * Breaks comma-separated entries onto their own lines at depth 1 of the outermost
 * `{}`/`[]`/`()` container and indents them. Deeper nesting and generic type args
 * (`<...>`) are left inline so balanced operators like `Slot.withType<Runner[]>()` survive.
 *
 * Returns the original value when it doesn't look like a structured literal.
 */
export function formatSourceValue(value: string, indent = '  '): string {
  const trimmed = value.trim();
  if (!trimmed) return value;

  const open = trimmed[0];
  const close = trimmed[trimmed.length - 1];
  const closers: Record<string, string> = { '{': '}', '[': ']', '(': ')' };
  if (!closers[open] || closers[open] !== close) return value;

  const inner = trimmed.slice(1, -1).trim();
  if (!inner) return value;

  const parts: string[] = [];
  let buf = '';
  let depth = 0;
  let strChar: string | null = null;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (strChar) {
      buf += ch;
      if (ch === '\\') {
        buf += inner[i + 1] ?? '';
        i += 1;
        continue;
      }
      if (ch === strChar) strChar = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      strChar = ch;
      buf += ch;
      continue;
    }
    if (ch === '{' || ch === '[' || ch === '(') {
      depth += 1;
      buf += ch;
      continue;
    }
    if (ch === '}' || ch === ']' || ch === ')') {
      depth -= 1;
      buf += ch;
      continue;
    }
    if (ch === ',' && depth === 0) {
      const piece = buf.trim();
      if (piece) parts.push(piece);
      buf = '';
      continue;
    }
    buf += ch;
  }
  const tail = buf.trim();
  if (tail) parts.push(tail);
  if (parts.length === 0) return value;

  return `${open}\n${parts.map((p) => `${indent}${p}`).join(',\n')}\n${close}`;
}
