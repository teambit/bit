import { resolve } from 'path';
import { Environment } from '../environments';
import { Tester, TesterExtension } from '../tester';
import { JestExtension } from '../jest';
import { TypescriptExtension } from '../typescript';
import { BuildTask } from '../builder';
import { Compiler, CompilerExtension } from '../compiler';
import { WebpackExtension } from '../webpack';
import { DevServer, BundlerContext, DevServerContext } from '../bundler';
import webpackConfigFactory from './webpack/webpack.config';
import previewConfigFactory from './webpack/webpack.preview.config';
import { Workspace } from '../workspace';
import { PkgExtension } from '../pkg';
import { Bundler } from '../bundler/bundler';
import { pathNormalizeToLinux } from '../../utils';

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
    private compiler: CompilerExtension,

    /**
     * webpack extension.
     */
    private webpack: WebpackExtension,

    /**
     * workspace extension.
     */
    private workspace: Workspace,

    /**
     * pkg extension.
     */
    private pkg: PkgExtension,

    /**
     * tester extension
     */
    private tester: TesterExtension
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
    const tsconfig = require('./typescript/tsconfig.json');
    return this.ts.createCompiler({
      tsconfig,
      types: [resolve(pathNormalizeToLinux(__dirname).replace('/dist/', '/src/'), './typescript/style.d.ts')],
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
    const withDocs = Object.assign(context, {
      entry: context.entry.concat([require.resolve('./docs')]),
    });

    return this.webpack.createDevServer(withDocs, webpackConfigFactory(this.workspace.path));
  }

  async getBundler(context: BundlerContext): Promise<Bundler> {
    return this.webpack.createBundler(context, previewConfigFactory());
  }

  /**
   * return a path to a docs template.
   */
  getDocsTemplate() {
    return require.resolve('./docs');
  }

  /**
   * return a function which mounts a given component to DOM
   */
  getMounter() {
    return require.resolve('./mount');
  }

  /**
   * define the package json properties to add to each component.
   */
  getPackageJsonProps() {
    return this.ts.getPackageJsonProps();
  }

  /**
   * adds dependencies to all configured components.
   */
  async getDependencies() {
    return {
      dependencies: {
        react: '-',
      },
      // TODO: add this only if using ts
      devDependencies: {
        '@types/react': '^16.9.17',
      },
      // TODO: take version from config
      peerDependencies: {
        react: '^16.12.0',
      },
    };
  }

  /**
   * returns the component build pipeline.
   */
  getPipe(): BuildTask[] {
    // return BuildPipe.from([this.compiler.task, this.tester.task]);
    // return BuildPipe.from([this.tester.task]);
    return [this.compiler.task, this.pkg.dryRunTask];
  }
}
