import { TsConfigSourceFile } from 'typescript';
import { merge } from 'lodash';
import { BuildTask } from '@teambit/builder';
import { Bundler, BundlerContext, DevServer, DevServerContext } from '@teambit/bundler';
import { Compiler, CompilerMain } from '@teambit/compiler';
import { Environment } from '@teambit/environments';
import { JestMain } from '@teambit/jest';
import { PkgMain } from '@teambit/pkg';
import { Tester, TesterMain } from '@teambit/tester';
import { TypescriptMain } from '@teambit/typescript';
import { WebpackMain } from '@teambit/webpack';
import { Workspace } from '@teambit/workspace';
import { pathNormalizeToLinux } from 'bit-bin/dist/utils';
import { join, resolve } from 'path';
import { Configuration } from 'webpack';
import webpackMerge from 'webpack-merge';
import { ReactMainConfig } from './react.main.runtime';
import webpackConfigFactory from './webpack/webpack.config';
import previewConfigFactory from './webpack/webpack.preview.config';

export const AspectEnvType = 'react';
const defaultTsConfig = require('./typescript/tsconfig.json');

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

  getTsConfig(targetTsConfig?: TsConfigSourceFile) {
    return targetTsConfig ? merge(targetTsConfig, defaultTsConfig) : defaultTsConfig;
  }

  /**
   * returns a component tester.
   */
  getTester(jestConfigPath: string): Tester {
    const config = jestConfigPath || require.resolve('./jest/jest.config');
    return this.jest.createTester(config);
  }

  /**
   * returns a component compiler.
   */
  getCompiler(targetConfig?: any): Compiler {
    // eslint-disable-next-line global-require
    const tsconfig = this.getTsConfig(targetConfig);

    return this.ts.createCompiler({
      tsconfig,
      // TODO: @david please remove this line and refactor to be something that makes sense.
      types: [resolve(pathNormalizeToLinux(__dirname).replace('/dist/', '/src/'), './typescript/style.d.ts')],
    });
  }

  /**
   * returns and configures the component linter.
   * TODO: linter aspect, es-hint aspect
   */
  getLinter() {}

  /**
   * get the default react webpack config.
   */
  getWebpackConfig(context: DevServerContext): Configuration {
    // TODO: add a react method for getting the dev server config in the aspect and move this away from here.
    const packagePaths = context.components
      .map((comp) => this.pkg.getPackageName(comp))
      .map((packageName) => join(this.workspace.path, 'node_modules', packageName));

    return webpackConfigFactory(this.workspace.path, packagePaths, context.id);
  }

  /**
   * returns and configures the React component dev server.
   */
  getDevServer(context: DevServerContext, targetConfig?: Configuration): DevServer {
    const defaultConfig = this.getWebpackConfig(context);
    const config = targetConfig ? webpackMerge(targetConfig, defaultConfig) : defaultConfig;
    const withDocs = Object.assign(context, {
      entry: context.entry.concat([require.resolve('./docs')]),
    });

    return this.webpack.createDevServer(withDocs, config);
  }

  async getBundler(context: BundlerContext, targetConfig?: Configuration): Promise<Bundler> {
    const defaultConfig = previewConfigFactory();
    const config = targetConfig ? webpackMerge(targetConfig, defaultConfig) : defaultConfig;
    return this.webpack.createBundler(context, config);
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
        '@types/mocha': '-',
        '@types/react-router-dom': '^5.1.5',
      },
      // TODO: take version from config
      peerDependencies: {
        react: '^16.13.1' || this.config.reactVersion,
        'react-dom': '^16.13.1',
        '@babel/runtime': '^7.11.2',
      },
    };
  }

  /**
   * returns the component build pipeline.
   */
  getPipe(): BuildTask[] {
    return [this.compiler.task, this.tester.task, this.pkg.preparePackagesTask, this.pkg.dryRunTask];
  }

  async __getDescriptor() {
    return {
      type: AspectEnvType,
    };
  }
}
