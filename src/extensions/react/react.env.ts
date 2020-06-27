import { Environment, ExecutionContext } from '../environments';
import { Tester } from '../tester';
import { JestExtension } from '../jest';
import { TypescriptExtension } from '../typescript';
import { BuildTask } from '../builder';
import { Compiler, Compile } from '../compiler';
import { WebpackExtension } from '../webpack';
import { DevServer } from '../bundler';
import webpackConfigFactory from './webpack/webpack.config';

/**
 * a component environment built for [React](https://reactjs.org) .
 */
export class ReactEnv implements Environment {
  constructor(
    /**
     * jest extension
     */
    private jest: JestExtension,

    /**
     * typescript extension.
     */
    private ts: TypescriptExtension,

    /**
     * compiler extension.
     */
    private compiler: Compile,

    /**
     * webpack extension.
     */
    private webpack: WebpackExtension
  ) {}

  /**
   * returns a component tester.
   */
  getTester(): Tester {
    return this.jest.createTester(require.resolve('./jest/jest.config'));
  }

  /**
   * returns a component compiler.
   */
  getCompiler(): Compiler {
    // eslint-disable-next-line global-require
    const tsConfig = require('./typescript/tsconfig.json');
    return this.ts.createCompiler(tsConfig);
  }

  /**
   * returns and configures the component linter.
   */
  getLinter() {}

  /**
   * returns and configures the React component dev server.
   */
  getDevServer(context: ExecutionContext): DevServer {
    return this.webpack.createDevServer(context.components, webpackConfigFactory());
  }

  /**
   * adds dependencies to all configured components.
   */
  async getDependencies() {
    return {
      dependencies: {
        react: '-'
      },
      // TODO: add this only if using ts
      devDependencies: {
        '@types/react': '^16.9.17'
      },
      // TODO: take version from config
      peerDependencies: {
        react: '^16.12.0'
      }
    };
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
