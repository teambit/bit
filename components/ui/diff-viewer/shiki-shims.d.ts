/**
 * Ambient module shims for shiki's subpath entry points.
 *
 * The repo-root `tsconfig.json` type-checks with `moduleResolution: "node"` (classic), which ignores
 * a package's `exports` map and `.d.mts` files — so `shiki/core`, `@shikijs/engine-javascript` and the
 * `@shikijs/langs/*` grammars don't resolve their types during `tsc --noEmit`. The Bit env compiler
 * uses `bundler` resolution and sees the real types; these minimal declarations only satisfy the
 * root type-check and are intentionally loose.
 */
declare module 'shiki/core' {
  export type HighlighterCore = {
    loadLanguage: (lang: unknown) => Promise<void>;
    codeToTokensBase: (
      code: string,
      options: { lang: string; theme: string }
    ) => Array<Array<{ content: string; color?: string; offset?: number }>>;
  };
  export function createHighlighterCore(options: unknown): Promise<HighlighterCore>;
}

declare module '@shikijs/engine-javascript' {
  export function createJavaScriptRegexEngine(options?: { forgiving?: boolean }): unknown;
}

declare module '@shikijs/langs/*' {
  const lang: unknown;
  export default lang;
}
