import type { DependencyDetector, FileContext } from '@teambit/dependency-resolver';
import { compileSync, type ImportSpecifier } from '@mdx-js/mdx';
import { mdxOptions } from '@teambit/mdx.modules.mdx-v3-options';

export class MDXDependencyDetector implements DependencyDetector {
  constructor(private supportedExtensions: string[]) {}

  isSupported(context: FileContext): boolean {
    return this.supportedExtensions.includes(context.ext);
  }

  detect(source: string): string[] {
    const output = compileSync(source, mdxOptions);
    const imports = (output.data?.imports as ImportSpecifier[]) || [];
    if (!imports) return [];
    const files: string[] = imports.map((importSpec) => {
      return importSpec.fromModule;
    });

    return files;
  }
}
