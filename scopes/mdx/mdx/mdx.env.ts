import type { Environment, EnvContext } from '@teambit/envs';
import { merge } from 'lodash';
import type { ReactMain } from '@teambit/react';
import type { Compiler, CompilerMain } from '@teambit/compiler';
import { MDXMultiCompiler } from '@teambit/mdx.compilers.mdx-multi-compiler';

export const MdxEnvType = 'mdx';

export class MdxEnv implements Environment {
  constructor(
    private react: ReactMain,
    private compiler: CompilerMain,
    private envContext: EnvContext
  ) {}

  icon = 'https://static.bit.dev/extensions-icons/mdx-icon-small.svg';

  private _mdxCompiler?: Compiler;

  /**
   * lazily create the MDX compiler. instantiating it loads `@teambit/mdx.compilers.mdx-multi-compiler`,
   * which pulls in `@mdx-js/mdx` and its large transitive tree. creating it on-demand (only when a
   * compiler is actually needed) keeps these out of the bit bootstrap - see
   * e2e/performance/filesystem-read.e2e.ts.
   */
  private getMdxCompiler(): Compiler {
    if (!this._mdxCompiler) {
      this._mdxCompiler = MDXMultiCompiler.from({})(this.envContext);
    }
    return this._mdxCompiler;
  }

  getCompiler() {
    return this.getMdxCompiler();
  }

  getBuildPipe() {
    return [
      this.compiler.createTask('MDXCompiler', this.getMdxCompiler()),
      ...this.react.reactEnv.createBuildPipeWithoutCompiler(),
    ];
  }

  async getDependencies() {
    const mdxDeps = {
      dependencies: {
        '@teambit/mdx.ui.mdx-scope-context': '1.0.0',
        '@mdx-js/react': '^3.1.1',
      },
    };
    return merge(this.react.reactEnv.getDependencies(), mdxDeps);
  }

  async __getDescriptor() {
    return {
      type: 'mdx',
    };
  }
}
