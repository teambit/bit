import { useEffect, useMemo, useState } from 'react';
import { createHighlighterCore } from 'shiki/core';
import type { HighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from '@shikijs/engine-javascript';
import { bitShikiTheme, BIT_THEME_NAME } from './shiki-bit-theme';

/** A single highlighted token: its text and the (sentinel) color shiki assigned to it. */
export type HlToken = { content: string; color?: string };
/** A file's tokens, indexed by line (line `n` is `lines[n - 1]`). */
export type HlLines = HlToken[][];

/**
 * shiki grammars are large, so each language is imported lazily and code-split. The map keys are the
 * normalized shiki language ids; values are dynamic imports of `@shikijs/langs/*`. Add a language by
 * adding an entry here — nothing else needs to change.
 */
const LANG_IMPORTERS: Record<string, () => Promise<any>> = {
  typescript: () => import('@shikijs/langs/typescript'),
  tsx: () => import('@shikijs/langs/tsx'),
  javascript: () => import('@shikijs/langs/javascript'),
  jsx: () => import('@shikijs/langs/jsx'),
  json: () => import('@shikijs/langs/json'),
  css: () => import('@shikijs/langs/css'),
  scss: () => import('@shikijs/langs/scss'),
  less: () => import('@shikijs/langs/less'),
  html: () => import('@shikijs/langs/html'),
  vue: () => import('@shikijs/langs/vue'),
  markdown: () => import('@shikijs/langs/markdown'),
  mdx: () => import('@shikijs/langs/mdx'),
  yaml: () => import('@shikijs/langs/yaml'),
  python: () => import('@shikijs/langs/python'),
  go: () => import('@shikijs/langs/go'),
  rust: () => import('@shikijs/langs/rust'),
  java: () => import('@shikijs/langs/java'),
  shellscript: () => import('@shikijs/langs/shellscript'),
  graphql: () => import('@shikijs/langs/graphql'),
  sql: () => import('@shikijs/langs/sql'),
};

/** map a file extension to a shiki language id (and the aliases shiki itself understands). */
const EXTENSION_TO_LANG: Record<string, string> = {
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'jsx',
  json: 'json',
  jsonc: 'json',
  css: 'css',
  scss: 'scss',
  sass: 'scss',
  less: 'less',
  html: 'html',
  htm: 'html',
  vue: 'vue',
  md: 'markdown',
  markdown: 'markdown',
  mdx: 'mdx',
  yml: 'yaml',
  yaml: 'yaml',
  py: 'python',
  go: 'go',
  rs: 'rust',
  java: 'java',
  sh: 'shellscript',
  bash: 'shellscript',
  zsh: 'shellscript',
  graphql: 'graphql',
  gql: 'graphql',
  sql: 'sql',
};

export function langFromFileName(fileName?: string): string | undefined {
  if (!fileName) return undefined;
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (!ext) return undefined;
  return EXTENSION_TO_LANG[ext];
}

let highlighterPromise: Promise<HighlighterCore> | undefined;
const loadedLangs = new Set<string>();
const langPromises = new Map<string, Promise<boolean>>();

/** lazily create the single shared highlighter (JS regex engine → no WASM, synchronous tokenizing). */
function getHighlighter(): Promise<HighlighterCore> {
  highlighterPromise ??= createHighlighterCore({
    themes: [bitShikiTheme],
    langs: [],
    // forgiving: don't throw on grammar patterns the JS engine can't compile — skip them instead.
    engine: createJavaScriptRegexEngine({ forgiving: true }),
  });
  return highlighterPromise;
}

/** ensure a language grammar is loaded into the shared highlighter. Resolves `false` if unsupported. */
async function ensureLanguage(lang: string): Promise<boolean> {
  if (loadedLangs.has(lang)) return true;
  const importer = LANG_IMPORTERS[lang];
  if (!importer) return false;
  let promise = langPromises.get(lang);
  if (!promise) {
    promise = (async () => {
      try {
        const hl = await getHighlighter();
        const mod = await importer();
        await hl.loadLanguage(mod.default ?? mod);
        loadedLangs.add(lang);
        return true;
      } catch {
        return false;
      }
    })();
    langPromises.set(lang, promise);
  }
  return promise;
}

// the synchronous instance, captured once the highlighter promise resolves the first time.
let highlighterInstance: HighlighterCore | undefined;

function tokenize(content: string, lang: string): HlLines | null {
  if (!highlighterInstance || !loadedLangs.has(lang)) return null;
  try {
    const tokenLines = highlighterInstance.codeToTokensBase(content, {
      lang,
      theme: BIT_THEME_NAME,
    });
    return tokenLines.map((line) => line.map((t) => ({ content: t.content, color: t.color })));
  } catch {
    return null;
  }
}

/**
 * Highlight a whole file's content into per-line tokens. The full file is tokenized at once (not
 * line-by-line) so multi-line constructs — template strings, block comments, JSX — stay correct.
 * While the grammar loads (or if the language is unsupported) returns `null`; callers should fall
 * back to rendering plain text, then re-render when tokens arrive.
 */
export function useHighlightedLines(content: string | undefined, lang: string | undefined): HlLines | null {
  // bumped once the grammar finishes loading, to trigger a single re-tokenize when it's ready.
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!lang || content === undefined) return undefined;
    if (loadedLangs.has(lang) && highlighterInstance) return undefined;
    ensureLanguage(lang).then((ok) => {
      if (!ok || cancelled) return undefined;
      // ensure the sync instance is captured before we ask the tree to re-tokenize
      return getHighlighter().then((hl) => {
        highlighterInstance = hl;
        if (!cancelled) setVersion((n) => n + 1);
      });
    });
    return () => {
      cancelled = true;
    };
  }, [content, lang]);

  // memoized so re-renders from view/expand state don't re-tokenize the whole file.
  return useMemo(() => {
    if (!lang || content === undefined) return null;
    return tokenize(content, lang);
  }, [content, lang, version]);
}
