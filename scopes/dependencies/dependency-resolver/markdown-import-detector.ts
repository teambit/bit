import { detective as detectMdxImports } from '@teambit/mdx.deps-detectors.detective-mdx';
import type { DependencyDetector, FileContext } from './detector-hook';

/**
 * baseline import detection for md/mdx files (e.g. component docs importing other components).
 * registered as a fallback so an aspect registering a full parser for these extensions (e.g. the
 * mdx aspect's compile-based detector) takes precedence whenever it is loaded, while md/mdx
 * imports are still detected when no such aspect is loaded.
 */
export class MarkdownImportDetector implements DependencyDetector {
  isFallback = true;

  isSupported(context: FileContext): boolean {
    return context.ext === '.md' || context.ext === '.mdx';
  }

  detect(source: string): string[] {
    return detectMdxImports(source);
  }
}
