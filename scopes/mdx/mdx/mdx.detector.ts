import type { DependencyDetector, FileContext } from '@teambit/dependency-resolver';
import { compileSync } from '@mdx-js/mdx';
import { mdxOptions } from '@teambit/mdx.modules.mdx-v3-options';
import type { Logger } from '@teambit/logger';

type ImportSpecifier = {
  /**
   * relative/absolute or module name. e.g. the `y` in the example of `import x from 'y';`
   */
  fromModule: string;

  /**
   * is default import (e.g. `import x from 'y';`)
   */
  isDefault?: boolean;

  /**
   * the name used to identify the module, e.g. the `x` in the example of `import x from 'y';`
   */
  identifier?: string;
};

/**
 * MDX options for dependency detection only.
 * Uses the remark plugins from mdxOptions (for frontmatter and import extraction)
 * but excludes rehype plugins like rehypeMdxCodeProps that fail on legacy
 * code fence meta syntax (e.g. `live=true`).
 */
const detectorMdxOptions = {
  ...(mdxOptions.remarkPlugins && { remarkPlugins: mdxOptions.remarkPlugins }),
  ...(mdxOptions.jsxImportSource && { jsxImportSource: mdxOptions.jsxImportSource }),
};

/**
 * Regex pattern for matching import statements in JavaScript/TypeScript.
 *
 * Structure: /import\s+(?:PATTERN_A|PATTERN_B)/g
 *   - The `import\s+` prefix is OUTSIDE the alternation, so both patterns require the import keyword
 *
 * This regex matches two import patterns in an alternation:
 *
 * PATTERN_A (captured in group 1): [type] <specifiers> from "module"
 *   - Optional "type" keyword for TypeScript type imports
 *   - Specifiers can be: default (x), named ({x}), namespace (* as x), or mixed (x, {y})
 *   - Followed by the `from` keyword and quoted module path
 *   - Module path is captured in group 1
 *
 * PATTERN_B (captured in group 2): "module"
 *   - Side-effect only imports with no specifiers, just quoted module path
 *   - The quotes directly follow `import` with only whitespace in between
 *   - Module path is captured in group 2
 *   - Note: This will NOT match random quoted strings in code (e.g., const x = "foo")
 *     because the `import\s+` prefix is required
 *
 * Example matches:
 *   import x from "y" -> group 1: "y"
 *   import { x } from "y" -> group 1: "y"
 *   import * as x from "y" -> group 1: "y"
 *   import x, { y } from "z" -> group 1: "z"
 *   import type { T } from "y" -> group 1: "y"
 *   import "y" -> group 2: "y"
 *
 * Limitations:
 *   - Will match imports in comments (e.g., // import "x")
 *   - Will match imports in code blocks/strings if they appear to be syntactically valid
 *   - These are acceptable trade-offs for the fallback mode
 */
const IMPORT_STATEMENT_REGEX =
  /import\s+(?:(?:type\s+)?(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)(?:\s*,\s*\{[^}]*\}|\s*,\s*\w+)?\s+from\s+['"]([^'"]+)['"]|['"]([^'"]+)['"])/g;

/**
 * Regex-based fallback for extracting import sources from MDX files.
 * Used when compileSync fails due to MDX v3 syntax incompatibilities in user content
 * (e.g. HTML comments, escaped characters, bare variable declarations, unclosed tags).
 *
 * Matches both standard imports (import x from "y") and side-effect imports (import "y").
 */
export function detectImportsWithRegex(source: string): string[] {
  const modules: string[] = [];
  let match: RegExpExecArray | null;
  // Reset regex state before use
  IMPORT_STATEMENT_REGEX.lastIndex = 0;
  while ((match = IMPORT_STATEMENT_REGEX.exec(source)) !== null) {
    // Use whichever capture group matched (group 1 for "from" imports, group 2 for side-effect imports)
    const moduleName = match[1] || match[2];
    if (moduleName) modules.push(moduleName);
  }
  return modules;
}

export class MDXDependencyDetector implements DependencyDetector {
  private logger?: Logger;
  private currentFilename?: string;

  constructor(
    private supportedExtensions: string[],
    logger?: Logger
  ) {
    this.logger = logger;
    // Bind detect to preserve `this` context when passed as a detached function.
    this.detect = this.detect.bind(this);
  }
  }

  isSupported(context: FileContext): boolean {
    // Capture filename for use in detect() warning messages.
    // isSupported is always called immediately before detect() for the same file.
    this.currentFilename = context.filename;
    return this.supportedExtensions.includes(context.ext);
  }

  detect(source: string): string[] {
    const filename = this.currentFilename;
    try {
      const output = compileSync(source, detectorMdxOptions);
      const imports = (output.data?.imports as ImportSpecifier[]) || [];
      if (!imports.length) return [];
      return imports.map((importSpec) => importSpec.fromModule);
    } catch (err: any) {
      // MDX v3 may fail to compile files with legacy syntax (HTML comments, escaped
      // characters in prose, bare variable declarations, unclosed tags, etc.).
      // Fall back to regex-based import detection which is sufficient for dependency resolution.
      const fileRef = filename ? ` File: ${filename}` : '';
      const msg = `MDX compilation failed, falling back to regex-based import detection.${fileRef} Error: ${err.message}`;
      this.logger?.consoleWarning(msg);
      return detectImportsWithRegex(source);
    }
  }
}
