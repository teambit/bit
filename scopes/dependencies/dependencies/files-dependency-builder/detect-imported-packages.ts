import path from 'path';
import { resolvePackageNameByPath } from '@teambit/legacy.utils';
import { sha1 } from '@teambit/toolbox.crypto.sha1';
import precinct from './precinct';

export type FileContent = { relativePath: string; content: string };

/**
 * the packages imported by the files of a component. a package that only dev files (e.g. tests) import is "dev".
 */
export type ImportedPackages = Map<string, 'runtime' | 'dev'>;

/**
 * the import specifiers of a file per its path and content hash. files that didn't change between versions are parsed
 * once. (not per content only, a detector may support a file by its name, e.g. env.jsonc). undefined when the file
 * can't be parsed.
 */
export type ImportsCache = Map<string, string[] | undefined>;

/**
 * files of these types have imports, but only an env detector finds them (see DependencyDetector). the env is not
 * loaded here, so the imports of the component are unknown.
 */
const EXTENSIONS_OF_ENV_DETECTORS = ['.vue', '.svelte', '.astro'];

/**
 * in files of these types, an import of a package starts with "~". without it, it's an import of a file, even when it's
 * not relative (e.g. `@import 'variables'`), same as a workspace resolves it (see lookupStyling).
 */
const EXTENSIONS_OF_STYLE_FILES = ['.scss', '.sass', '.less'];

/**
 * the packages the given files import, found by parsing their content, without resolving the imports. a workspace
 * resolves each import against node_modules (see AutoDetectDeps), a bare scope has the files in memory only.
 * returns undefined when the imports of one of the files are unknown: it can't be parsed, or only an env detector
 * supports its type.
 */
export async function detectImportedPackages(
  files: FileContent[],
  isDevFile: (relativePath: string) => boolean = () => false,
  cache: ImportsCache = new Map()
): Promise<ImportedPackages | undefined> {
  const importedPackages: ImportedPackages = new Map();
  for (const file of files) {
    const specifiers = await getImportSpecifiers(file, cache);
    if (!specifiers) return undefined;
    const type = isDevFile(file.relativePath) ? 'dev' : 'runtime';
    const isStyleFile = EXTENSIONS_OF_STYLE_FILES.includes(path.extname(file.relativePath));
    specifiers.forEach((specifier) => {
      if (isStyleFile && !specifier.startsWith('~')) return;
      const packageName = toPackageName(specifier);
      if (!packageName || importedPackages.get(packageName) === 'runtime') return;
      importedPackages.set(packageName, type);
    });
  }
  return importedPackages;
}

async function getImportSpecifiers(file: FileContent, cache: ImportsCache): Promise<string[] | undefined> {
  const ext = path.extname(file.relativePath);
  const key = `${file.relativePath}:${sha1(file.content)}`;
  if (cache.has(key)) return cache.get(key);
  let specifiers: string[] | undefined;
  try {
    specifiers = await precinct.paperworkFromContent(file.relativePath, file.content, { includeCore: false });
    // a file type with no detector has no imports, same as in a workspace whose env has no detector for it
    if (!specifiers && !EXTENSIONS_OF_ENV_DETECTORS.includes(ext)) specifiers = [];
  } catch {
    specifiers = undefined; // a workspace doesn't snap it either, it reports a parsing error
  }
  cache.set(key, specifiers);
  return specifiers;
}

/**
 * e.g. "@scope/pkg/dist/foo" => "@scope/pkg". undefined for an import of a file (relative), which is not a package.
 */
function toPackageName(specifier: string): string | undefined {
  if (specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('#')) return undefined;
  if (specifier.includes('!') || /^https?:/.test(specifier)) return undefined; // webpack loaders and urls
  return resolvePackageNameByPath(specifier.replace(/^~/, ''));
}
