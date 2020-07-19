import { Environment } from '../environments';
import { Tester } from '../tester';
import { BuildTask } from '../builder';
import { Compiler, CompilerExtension } from '../compiler';
import { DevServer, DevServerContext } from '../bundler';
import { StencilExtension } from './stencil.extension';
import { WebpackExtension } from '../webpack';
import webpackConfig from './webpack/webpack.config';

/**
 * a component environment built for [React](https://reactjs.org) .
 */
export class StencilEnv implements Environment {
  constructor(
    /**
     * stencil extension.
     */
    private stencil: StencilExtension,

    /**
     * compiler extension.
     */
    private compiler: CompilerExtension,

    /**
     * webpack extension.
     */
    private webpack: WebpackExtension
  ) {}

  /**
   * returns a component tester.
   */
  getTester(): Tester {
    return this.stencil.createTester();
  }

  /**
   * returns a component compiler.
   */
  getCompiler(): Compiler {
    return this.stencil.createCompiler({
      module: 'esm',
    });
  }

  /**
   * returns and configures the component linter.
   */
  getLinter() {}

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
    // return require.resolve('./docs');
  }

  /**
   * adds dependencies to all configured components.
   */
  async getDependencies() {
    return {};
  }

  /**
   * returns the component build pipeline.
   */
  getPipe(): BuildTask[] {
    // return BuildPipe.from([this.compiler.task, this.tester.task]);
    // return BuildPipe.from([this.tester.task]);
    return [this.compiler.task];
  }
}
