import { BuildTask } from '@teambit/builder';
import { DevServer, DevServerContext } from '@teambit/bundler';
import type { CompilerMain } from '@teambit/compiler';
import { Compiler } from '@teambit/compiler';
import { BuilderEnv, DependenciesEnv, DevEnv, TesterEnv } from '@teambit/envs';
import { VariantPolicyConfigObject } from '@teambit/dependency-resolver';
import { Tester } from '@teambit/tester';
import type { WebpackMain } from '@teambit/webpack';

import type { StencilMain } from './stencil.main.runtime';
import webpackConfig from './webpack/webpack.config';

/**
 * a component environment built for [React](https://reactjs.org) .
 */
export class StencilEnv implements TesterEnv, BuilderEnv, TesterEnv, DevEnv, DependenciesEnv {
  constructor(
    /**
     * stencil extension.
     */
    private stencil: StencilMain,

    /**
     * compiler extension.
     */
    private compiler: CompilerMain,

    /**
     * webpack extension.
     */
    private webpack: WebpackMain
  ) {}

  /**
   * returns a component tester.
   */
  getTester(): Tester {
    // @ts-ignore
    return this.stencil.createTester();
  }

  /**
   * returns a component compiler.
   */
  getCompiler(): Compiler {
    // @ts-ignore
    return this.stencil.createCompiler({
      module: 'esm',
    });
  }

  /**
   * returns and configures the React component dev server.
   */
  getDevServer(context: DevServerContext): DevServer {
    return this.webpack.createDevServer(context, webpackConfig());
  }

  /**
   * return a path to a docs template.
   */
  getDocsTemplate() {
    return ''; // return require.resolve('./docs');
  }

  /**
   * adds dependencies to all configured components.
   */
  async getDependencies() {
    return {} as VariantPolicyConfigObject;
  }

  /**
   * returns the component build pipeline.
   */
  getBuildPipe(): BuildTask[] {
    return [this.compiler.createTask('StencilCompiler', this.getCompiler())];
  }
}
