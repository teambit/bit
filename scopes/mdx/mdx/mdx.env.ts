import type { Environment } from '@teambit/envs';
import { merge } from 'lodash';
import type { ReactMain } from '@teambit/react';
import { BabelCompiler } from '@teambit/compilation.babel-compiler';
import type { TypescriptConfigMutator } from '@teambit/typescript.modules.ts-config-mutator';
import type { TsConfigTransformer } from '@teambit/typescript';
import { babelConfig } from './babel/babel.config';
import type { Logger } from '@teambit/logger';
import type { MultiCompilerMain } from '@teambit/multi-compiler';
import type { CompilerMain } from '@teambit/compiler';
import type { DocsMain } from '@teambit/docs';
import { MDXAspect } from './mdx.aspect';
import type { MDXCompilerOpts } from './mdx.compiler';
import { MDXCompiler } from './mdx.compiler';

export const MdxEnvType = 'mdx';

export class MdxEnv implements Environment {
  constructor(
    private react: ReactMain,
    private logger: Logger,
    private multiCompiler: MultiCompilerMain,
    private compiler: CompilerMain,
    private docs: DocsMain
  ) {}
  getCompiler() {
    const tsTransformer: TsConfigTransformer = (tsconfig: TypescriptConfigMutator) => {
      // set the shouldCopyNonSupportedFiles to false since we don't want ts to copy the .mdx file to the dist folder (it will conflict with the .mdx.js file created by the mdx compiler)
      tsconfig.setCompileJs(false).setCompileJsx(false).setShouldCopyNonSupportedFiles(false);
      return tsconfig;
    };
    const tsCompiler = this.react.env.getCompiler([tsTransformer]);

    const babelCompiler = BabelCompiler.create(
      {
        babelTransformOptions: babelConfig,
        // set the shouldCopyNonSupportedFiles to false since we don't want babel to copy the .mdx file to the dist
        // folder (it will conflict with the .mdx.js file created by the mdx compiler)
        shouldCopyNonSupportedFiles: false,
      },
      { logger: this.logger }
    );

    return this.multiCompiler.createCompiler(
      [
        babelCompiler,
        this.createMdxCompiler({ ignoredPatterns: this.docs.getPatterns(), babelTransformOptions: babelConfig }),
        tsCompiler,
      ],
      {}
    );
  }

  getBuildPipe() {
    const mdxCompiler = this.getCompiler();
    return [
      this.compiler.createTask('MDXCompiler', mdxCompiler),
      ...this.react.reactEnv.createBuildPipeWithoutCompiler(),
    ];
  }

  async getDependencies() {
    const mdxDeps = {
      dependencies: {
        '@teambit/mdx.ui.mdx-scope-context': '1.0.0',
        '@mdx-js/react': '1.6.22',
      },
    };
    return merge(this.react.reactEnv.getDependencies(), mdxDeps);
  }

  /**
   * create an instance of the MDX compiler.
   */
  createMdxCompiler(opts: MDXCompilerOpts = {}) {
    const mdxCompiler = new MDXCompiler(MDXAspect.id, opts);
    return mdxCompiler;
  }

  async __getDescriptor() {
    return {
      type: 'mdx',
    };
  }
}
