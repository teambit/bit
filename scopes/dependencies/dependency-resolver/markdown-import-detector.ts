import type { DependencyDetector, FileContext } from './detector-hook';

/**
 * Regex pattern for matching import statements in md/mdx files.
 *
 * Matches two import patterns in an alternation (both require the `import` keyword prefix):
 * - `[type] <specifiers> from "module"` - default (x), named ({x}), namespace (* as x) or mixed
 *   specifiers, module path captured in group 1.
 * - `"module"` - side-effect only imports, module path captured in group 2.
 *
 * Limitations: may match imports inside comments or code blocks. acceptable for dependency
 * detection - the same trade-off the mdx aspect makes in its own regex fallback.
 */
const IMPORT_STATEMENT_REGEX =
  /import\s+(?:(?:type\s+)?(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)(?:\s*,\s*\{[^}]*\}|\s*,\s*\w+)?\s+from\s+['"]([^'"]+)['"]|['"]([^'"]+)['"])/g;

export function detectMarkdownImports(source: string): string[] {
  const modules: string[] = [];
  let match: RegExpExecArray | null;
  IMPORT_STATEMENT_REGEX.lastIndex = 0;
  while ((match = IMPORT_STATEMENT_REGEX.exec(source)) !== null) {
    const moduleName = match[1] || match[2];
    if (moduleName) modules.push(moduleName);
  }
  return modules;
}

/**
 * baseline import detection for md/mdx files (e.g. component docs importing other components).
 * historically this detection was provided by the mdx aspect, which was a core aspect and thus
 * always loaded. now that it is a regular env, md/mdx imports must still be detected even when no
 * component in the workspace loads the mdx aspect - otherwise docs dependencies silently drop
 * from the model and break e.g. the preview bundling in capsules. registered as a fallback so the
 * mdx aspect's compile-based detector takes precedence whenever it is loaded.
 */
export class MarkdownImportDetector implements DependencyDetector {
  isFallback = true;

  isSupported(context: FileContext): boolean {
    return context.ext === '.md' || context.ext === '.mdx';
  }

  detect(source: string): string[] {
    return detectMarkdownImports(source);
  }
}
