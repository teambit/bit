/**
 * Regex pattern for matching import statements in md/mdx files.
 *
 * Matches two import patterns in an alternation (both require a line to start with the `import`
 * keyword, as MDX only treats block-level statements as ESM):
 * - `[type] <specifiers> from "module"` - default (x), named ({x}), namespace (* as x) or mixed
 *   specifiers, module path captured in group 1.
 * - `"module"` - side-effect only imports, module path captured in group 2.
 */
const IMPORT_STATEMENT_REGEX =
  /^import\s+(?:(?:type\s+)?(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)(?:\s*,\s*\{[^}]*\}|\s*,\s*\w+)?\s+from\s+['"]([^'"]+)['"]|['"]([^'"]+)['"])/gm;

/**
 * imports shown inside fenced code blocks, inline code spans or comments are documentation
 * examples, not real ESM imports - MDX doesn't execute them, so they must not become
 * dependencies (a usage example importing the component's own package would otherwise produce a
 * self-import issue).
 */
function stripNonEsmContent(source: string): string {
  return source
    .replace(/```[\s\S]*?```/g, '')
    .replace(/~~~[\s\S]*?~~~/g, '')
    .replace(/`[^`\n]*`/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
}

/**
 * extract the module specifiers imported by a md/mdx file (e.g. component docs importing other
 * components). regex-based - it doesn't compile the mdx, so it works on any content, including
 * files with syntax the mdx compiler rejects (HTML comments, unclosed tags, legacy code-fence
 * meta syntax and so on).
 */
export function detective(source: string): string[] {
  const strippedSource = stripNonEsmContent(source);
  const modules: string[] = [];
  let match: RegExpExecArray | null;
  IMPORT_STATEMENT_REGEX.lastIndex = 0;
  while ((match = IMPORT_STATEMENT_REGEX.exec(strippedSource)) !== null) {
    const moduleName = match[1] || match[2];
    if (moduleName) modules.push(moduleName);
  }
  return modules;
}
