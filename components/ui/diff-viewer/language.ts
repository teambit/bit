/** Map file extensions and common fenced-code aliases to Shiki language ids. */
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
  // Jest snapshots (`x.spec.ts.snap` / `.snap`) are JavaScript modules.
  snap: 'javascript',
};

/** Normalize explicit language names and common aliases to Shiki grammar ids. */
export function normalizeLanguage(language?: string): string | undefined {
  const normalized = language?.trim().toLowerCase();
  if (!normalized) return undefined;
  return EXTENSION_TO_LANG[normalized] ?? normalized;
}

export function langFromFileName(fileName?: string): string | undefined {
  if (!fileName) return undefined;
  const ext = fileName.split('.').pop();
  return normalizeLanguage(ext);
}
