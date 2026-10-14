import type { DependencyDetector, FileContext } from '@teambit/dependency-resolver';
import { compileSync } from '@mdx-js/mdx';
import { mdxOptions } from '@teambit/mdx.modules.mdx-v3-options';
import { detective as detectImportsWithRegex } from '@teambit/mdx.deps-detectors.detective-mdx';
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
 *
 * Computed lazily to avoid triggering the mdx-v3-options dependency chain
 * (~180 files) during bootstrap for commands that don't need MDX processing.
 */
let _detectorMdxOptions: Record<string, any> | undefined;
function getDetectorMdxOptions() {
  if (!_detectorMdxOptions) {
    _detectorMdxOptions = {
      ...(mdxOptions.remarkPlugins && { remarkPlugins: mdxOptions.remarkPlugins }),
      ...(mdxOptions.jsxImportSource && { jsxImportSource: mdxOptions.jsxImportSource }),
    };
  }
  return _detectorMdxOptions;
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

  isSupported(context: FileContext): boolean {
    // Capture filename for use in detect() warning messages.
    // isSupported is always called immediately before detect() for the same file.
    this.currentFilename = context.filename;
    return this.supportedExtensions.includes(context.ext);
  }

  detect(source: string): string[] {
    const filename = this.currentFilename;
    try {
      const output = compileSync(source, getDetectorMdxOptions());
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
