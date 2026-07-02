/**
 * Bit syntax theme for shiki.
 *
 * shiki resolves a TextMate theme's `foreground` to a concrete color string and returns it on each
 * token. We don't want shiki to pick *visual* colors — Bit's look must come from the design-system
 * CSS variables (so light/dark themes apply automatically). To bridge the two worlds we paint every
 * scope with a unique **sentinel** hex that never reaches the screen; the renderer maps that sentinel
 * back to the matching Bit CSS variable (see {@link SENTINEL_TO_CSS_VAR}). This keeps shiki's job to
 * "which semantic category is this token" and leaves "what color is that category" to Bit's theme.
 */

/** sentinel hex → semantic category. Unique, never rendered; translated to a Bit CSS var at render. */
export const SENTINEL = {
  default: '#e1e100',
  keyword: '#e10001',
  string: '#e10002',
  number: '#e10003',
  comment: '#e10004',
  component: '#e10005',
  operator: '#e10006',
  function: '#e10007',
  property: '#e10008',
} as const;

/**
 * Map each sentinel to a Bit design-system CSS variable (with a sensible fallback so highlighting is
 * never invisible if a theme is missing). Bit exposes six syntax tokens — function/property fold onto
 * the closest of those six. `default` returns `undefined` so the token simply inherits the code color.
 */
export const SENTINEL_TO_CSS_VAR: Record<string, string | undefined> = {
  [SENTINEL.default]: undefined,
  [SENTINEL.keyword]: 'var(--syntax-keyword-color, var(--syntax-keyword, #8250df))',
  [SENTINEL.string]: 'var(--syntax-string-color, var(--syntax-string, #b35827))',
  [SENTINEL.number]: 'var(--syntax-number-color, var(--syntax-number, #1a7f37))',
  [SENTINEL.comment]: 'var(--syntax-comment-color, var(--syntax-comment, #9598a1))',
  [SENTINEL.component]: 'var(--syntax-component-color, var(--syntax-component, #0969da))',
  [SENTINEL.operator]: 'var(--syntax-operator-color, var(--syntax-operator, #707279))',
  // function & property fold onto the closest available Bit token
  [SENTINEL.function]: 'var(--syntax-component-color, var(--syntax-component, #0969da))',
  [SENTINEL.property]: 'var(--on-surface-color, #2b2b2b)',
};

/** resolve a shiki token color (sentinel) to the Bit CSS var, tolerant of case normalization. */
export function resolveTokenColor(color?: string): string | undefined {
  if (!color) return undefined;
  return SENTINEL_TO_CSS_VAR[color.toLowerCase()];
}

type ThemeSetting = { scope?: string | string[]; settings: { foreground?: string; fontStyle?: string } };

const settings: ThemeSetting[] = [
  { settings: { foreground: SENTINEL.default } },
  {
    scope: ['comment', 'punctuation.definition.comment', 'string.comment'],
    settings: { foreground: SENTINEL.comment, fontStyle: 'italic' },
  },
  {
    scope: [
      'string',
      'string.quoted',
      'string.template',
      'constant.character',
      'constant.other.symbol',
      'punctuation.definition.string',
      'meta.embedded.line.css string',
    ],
    settings: { foreground: SENTINEL.string },
  },
  {
    scope: [
      'constant.numeric',
      'constant.language.boolean',
      'constant.language.null',
      'constant.language.undefined',
      'constant.language.nan',
      'constant.language.infinity',
      'variable.other.constant',
      'constant.other',
    ],
    settings: { foreground: SENTINEL.number },
  },
  {
    scope: [
      'keyword',
      'keyword.control',
      'keyword.other',
      'storage',
      'storage.type',
      'storage.modifier',
      'keyword.operator.new',
      'keyword.operator.expression',
      'keyword.operator.logical',
      'variable.language.this',
      'variable.language.super',
      'support.type.primitive',
      'constant.language',
      'markup.bold',
      'markup.heading',
    ],
    settings: { foreground: SENTINEL.keyword },
  },
  {
    scope: [
      'entity.name.type',
      'entity.name.class',
      'entity.other.inherited-class',
      'support.class',
      'support.type',
      'entity.name.namespace',
      'entity.name.tag',
      'entity.other.attribute-name',
      'meta.type.annotation',
      'support.type.object',
      'meta.tag',
    ],
    settings: { foreground: SENTINEL.component },
  },
  {
    scope: [
      'entity.name.function',
      'support.function',
      'meta.function-call entity.name.function',
      'entity.name.function.member',
      'variable.function',
      'meta.definition.method entity.name.function',
    ],
    settings: { foreground: SENTINEL.function },
  },
  {
    scope: [
      'keyword.operator',
      'punctuation',
      'meta.brace',
      'meta.delimiter',
      'punctuation.separator',
      'punctuation.terminator',
      'punctuation.accessor',
      'storage.type.function.arrow',
    ],
    settings: { foreground: SENTINEL.operator },
  },
  {
    scope: ['variable.other.property', 'meta.object-literal.key', 'support.variable.property'],
    settings: { foreground: SENTINEL.property },
  },
];

/** The Bit shiki theme — sentinel-painted; colors are translated to Bit CSS vars in the renderer. */
export const bitShikiTheme = {
  name: 'bit',
  type: 'dark' as const,
  colors: {
    'editor.foreground': SENTINEL.default,
    'editor.background': '#00000000',
  },
  fg: SENTINEL.default,
  bg: '#00000000',
  settings,
};

export const BIT_THEME_NAME = 'bit';
