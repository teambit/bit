import { useEffect, useMemo, useState } from 'react';
import { bitShikiTheme, BIT_THEME_NAME } from './shiki-bit-theme';
// shiki's ESM-only subpath imports are contained in this one boundary module (see its header for
// why); everything below is compiled against its explicitly-typed re-exports, not shiki directly.
import {
  createHighlighterCore,
  createJavaScriptRegexEngine,
  LANG_IMPORTERS,
  type ShikiHighlighterCore as HighlighterCore,
} from './shiki-imports';

/** A single highlighted token: its text and the (sentinel) color shiki assigned to it. */
export type HlToken = { content: string; color?: string };
/** A file's tokens, indexed by line (line `n` is `lines[n - 1]`). */
export type HlLines = HlToken[][];

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
  jsonc: 'jsonc',
  json5: 'jsonc',
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
  // jest snapshots (`x.spec.ts.snap` / `.snap`) are JS modules (exports[`...`] = `...`), and
  // `split('.').pop()` reduces every variant to the same `snap` extension.
  snap: 'javascript',
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
  // Capture in a const rather than relying on `??=` control-flow narrowing — older TS (the per-env
  // capsule compiler) doesn't narrow `Promise<...> | undefined` after `??=`, so `return` would error.
  const existing = highlighterPromise;
  if (existing) return existing;
  const created = createHighlighterCore({
    themes: [bitShikiTheme],
    langs: [],
    // forgiving: don't throw on grammar patterns the JS engine can't compile — skip them instead.
    engine: createJavaScriptRegexEngine({ forgiving: true }),
  }).catch((err) => {
    // don't memoize a rejection: a transient init failure would otherwise permanently disable
    // highlighting for the whole session (every later call would get the same rejected promise).
    highlighterPromise = undefined;
    throw err;
  });
  highlighterPromise = created;
  return created;
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
        // don't cache a transient failure (e.g. a dynamic-chunk load error) — dropping the memoized
        // promise lets the next call retry instead of leaving the language permanently unhighlighted.
        langPromises.delete(lang);
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
 * files at or below this size tokenize synchronously during render (a few ms, no unhighlighted
 * flash); larger files tokenize in an idle callback AFTER the plain-text diff has painted. A big
 * file's whole-file tokenize is one non-interruptible chunk — doing it inside the mount render
 * blocked the main thread while diffs streamed in, which froze view-mode clicks.
 */
const SYNC_TOKENIZE_LIMIT = 20_000;

type DeferredTokens = { content: string; lang: string; lines: HlLines | null };

/**
 * Highlight a whole file's content into per-line tokens. The full file is tokenized at once (not
 * line-by-line) so multi-line constructs — template strings, block comments, JSX — stay correct.
 * While the grammar loads (or if the language is unsupported) returns `null`; callers should fall
 * back to rendering plain text, then re-render when tokens arrive. Files over SYNC_TOKENIZE_LIMIT
 * also return `null` first and deliver their tokens from an idle slot.
 */
export function useHighlightedLines(content: string | undefined, lang: string | undefined): HlLines | null {
  // bumped once the grammar finishes loading, to trigger a single re-tokenize when it's ready.
  const [version, setVersion] = useState(0);
  const [deferred, setDeferred] = useState<DeferredTokens | null>(null);

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

  const isLarge = (content?.length ?? 0) > SYNC_TOKENIZE_LIMIT;

  // small files: memoized so re-renders from view/expand state don't re-tokenize the whole file.
  const syncLines = useMemo(() => {
    if (!lang || content === undefined || isLarge) return null;
    return tokenize(content, lang);
  }, [content, lang, isLarge, version]);

  // large files: tokenize off the render, in an idle slot. `version` re-runs this once the grammar
  // finishes loading (tokenize() returns null until then, same as the sync path).
  useEffect(() => {
    if (!lang || content === undefined || !isLarge) return undefined;
    if (!loadedLangs.has(lang) || !highlighterInstance) return undefined;
    let cancelled = false;
    const idle: (cb: () => void) => unknown =
      typeof requestIdleCallback === 'function' ? requestIdleCallback : (cb) => setTimeout(cb, 0);
    const cancelIdle: (handle: any) => void =
      typeof cancelIdleCallback === 'function' ? cancelIdleCallback : clearTimeout;
    const handle = idle(() => {
      if (cancelled) return;
      const lines = tokenize(content, lang);
      if (!cancelled) setDeferred({ content, lang, lines });
    });
    return () => {
      cancelled = true;
      cancelIdle(handle);
    };
  }, [content, lang, isLarge, version]);

  if (!isLarge) return syncLines;
  // guard against serving a previous file's tokens while the current one is still queued.
  return deferred && deferred.content === content && deferred.lang === lang ? deferred.lines : null;
}
