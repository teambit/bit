import type { DependencyDetector, FileContext } from '@teambit/dependency-resolver';
// import { compileSync } from '@mdx-js/mdx';
import { mdxOptions } from '@teambit/mdx.modules.mdx-v3-options';

const { compileSync } = require('@mdx-js/mdx');

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
