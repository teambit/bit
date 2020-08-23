import { resolve, join } from 'path';
import { Environment } from '@teambit/environments';
import { Tester, TesterMain } from '@teambit/tester';
import { BuildTask } from '@teambit/builder';
import { Compiler, CompilerMain } from '@teambit/compiler';
import { DevServer, BundlerContext, DevServerContext } from '@teambit/bundler';
import { Workspace } from '@teambit/workspace';
import { Bundler } from '@teambit/bundler';
import { pathNormalizeToLinux } from 'bit-bin/dist/utils';
import { TypescriptMain } from '@teambit/typescript';
import { WebpackMain } from '@teambit/webpack';
import { JestMain } from '@teambit/jest';
import { PkgMain } from '@teambit/pkg';
import webpackConfigFactory from './webpack/webpack.config';
import previewConfigFactory from './webpack/webpack.preview.config';
import { ReactMainConfig } from './react.main.runtime';

export const AspectEnvType = 'react';

/**
 * a component environment built for [React](https://reactjs.org) .
 */
export class ReactEnv implements Environment {
  constructor(
    /**
     * jest extension
     */
    private jest: JestMain,

    /**
     * typescript extension.
     */
    private ts: TypescriptMain,

    /**
     * compiler extension.
     */
    private compiler: CompilerMain,

    /**
     * webpack extension.
     */
    private webpack: WebpackMain,

    /**
     * workspace extension.
     */
    private workspace: Workspace,

    /**
     * pkg extension.
     */
    private pkg: PkgMain,

    /**
     * tester extension
     */
    private tester: TesterMain,

    private config: ReactMainConfig
  ) {}

  private _tsconfig: any;

  setTsConfig(tsconfig: any) {
    this._tsconfig = tsconfig;
    return this;
  }

  /**
   * returns a component tester.
   */
  getTester(): Tester {
    return this.jest.createTester(require.resolve('./jest/jest.config'));
  }

  /**
   * returns a component compiler.
   */
  getCompiler(targetConfig?: any): Compiler {
    // eslint-disable-next-line global-require
    const tsconfig = targetConfig || this._tsconfig || require('./typescript/tsconfig.json');
    return this.ts.createCompiler({
      tsconfig,
      // TODO: @david please remove this line and refactor to be something that makes sense.
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

    // TODO: add a react method for getting the dev server config in the aspect and move this away from here.
    const targets = context.components.map((component) => {
      return join(this.pkg.getPackageName(component));
    });

    return this.webpack.createDevServer(withDocs, webpackConfigFactory(this.workspace.path, targets));
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
        '@types/react': '16.9.43',
        '@types/jest': '~26.0.9',
        '@types/react-router-dom': '^5.1.5',
      },
      // TODO: take version from config
      peerDependencies: {
        react: '^16.13.1' || this.config.reactVersion,
      },
    };
  }

  /**
   * returns the component build pipeline.
   */
  getPipe(): BuildTask[] {
    // return BuildPipe.from([this.compiler.task, this.tester.task]);
    // return BuildPipe.from([this.tester.task]);
    // return [this.compiler.task, this.pkg.preparePackagesTask, this.pkg.dryRunTask];
    return [this.compiler.task, this.pkg.dryRunTask];
  }

  async __getDescriptor() {
    return {
      type: AspectEnvType,
    };
  }
}
