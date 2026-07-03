// @ts-nocheck
/**
 * Boundary module that owns every import of shiki's ESM-only subpath entry points.
 *
 * shiki ships its subpaths (`shiki/core`, `@shikijs/engine-javascript`, `@shikijs/langs/*`)
 * as ESM behind an `exports` map, with types in `.d.mts`. This repo type-checks with classic
 * `moduleResolution: "node"` and (at the root) `module: "commonjs"`, which can't read `exports`
 * maps or `.d.mts` — so `tsc` either can't find these modules or finds the `.d.mts` and rejects
 * it under the current resolution. The bundler (rspack/webpack) resolves them correctly at build
 * time; the mismatch is purely a type-check artifact.
 *
 * Rather than declare fake ambient modules (which TypeScript only uses as a *fallback*, so they
 * silently stop working the moment the real package is installed in the compile graph — exactly
 * what broke CI), this one file opts out of type-checking with `@ts-nocheck` and re-exports a
 * small, explicitly-typed surface. Every consumer (`highlighter.ts`) stays fully type-checked
 * against these annotations; only this ESM boundary is exempt, and the fix works identically
 * under root `tsc`, every env capsule, and the bundler regardless of what's installed.
 */
import { createHighlighterCore as _createHighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine as _createJavaScriptRegexEngine } from '@shikijs/engine-javascript';

/** A single highlighted token as shiki returns it. */
export type ShikiHighlighterCore = {
  loadLanguage: (lang: unknown) => Promise<void>;
  codeToTokensBase: (
    code: string,
    options: { lang: string; theme: string }
  ) => Array<Array<{ content: string; color?: string; offset?: number }>>;
};

export const createHighlighterCore: (options: unknown) => Promise<ShikiHighlighterCore> = _createHighlighterCore;

export const createJavaScriptRegexEngine: (options?: { forgiving?: boolean }) => unknown = _createJavaScriptRegexEngine;

/**
 * shiki grammars are large, so each language is imported lazily and code-split. The map keys are the
 * normalized shiki language ids; values are dynamic imports of `@shikijs/langs/*`. Add a language by
 * adding an entry here — nothing else needs to change.
 */
export const LANG_IMPORTERS: Record<string, () => Promise<{ default?: unknown }>> = {
  typescript: () => import('@shikijs/langs/typescript'),
  tsx: () => import('@shikijs/langs/tsx'),
  javascript: () => import('@shikijs/langs/javascript'),
  jsx: () => import('@shikijs/langs/jsx'),
  json: () => import('@shikijs/langs/json'),
  jsonc: () => import('@shikijs/langs/jsonc'),
  css: () => import('@shikijs/langs/css'),
  scss: () => import('@shikijs/langs/scss'),
  less: () => import('@shikijs/langs/less'),
  html: () => import('@shikijs/langs/html'),
  vue: () => import('@shikijs/langs/vue'),
  markdown: () => import('@shikijs/langs/markdown'),
  mdx: () => import('@shikijs/langs/mdx'),
  yaml: () => import('@shikijs/langs/yaml'),
  shellscript: () => import('@shikijs/langs/shellscript'),
  graphql: () => import('@shikijs/langs/graphql'),
  sql: () => import('@shikijs/langs/sql'),
};
