import type { Environment } from '@teambit/envs';
import { merge } from 'lodash';
import type { ReactMain } from '@teambit/react';
import type { Compiler, CompilerMain } from '@teambit/compiler';

export const MdxEnvType = 'mdx';

export class MdxEnv implements Environment {
  constructor(
    private react: ReactMain,
    private mdxCompiler: Compiler,
    private compiler: CompilerMain
  ) {}

  icon = 'https://static.bit.dev/extensions-icons/mdx-icon-small.svg';

  getCompiler() {
    return this.mdxCompiler;
  }

  getBuildPipe() {
    return [
      this.compiler.createTask('MDXCompiler', this.mdxCompiler),
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
