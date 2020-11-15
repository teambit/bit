import ts, { TsConfigSourceFile } from 'typescript';
import { BuildTask } from '@teambit/builder';
import { merge } from 'lodash';
import { Bundler, BundlerContext, DevServer, DevServerContext } from '@teambit/bundler';
import { Compiler, CompilerMain, CompilerOptions } from '@teambit/compiler';
import { Environment } from '@teambit/envs';
import { JestMain } from '@teambit/jest';
import { PkgMain } from '@teambit/pkg';
import { Tester, TesterMain } from '@teambit/tester';
import { TypescriptMain } from '@teambit/typescript';
import { WebpackMain } from '@teambit/webpack';
import { Workspace } from '@teambit/workspace';
import { ESLintMain } from '@teambit/eslint';
import { pathNormalizeToLinux } from 'bit-bin/dist/utils';
import { join, resolve } from 'path';
import { Configuration } from 'webpack';
import webpackMerge from 'webpack-merge';
import { ReactMainConfig } from './react.main.runtime';
import webpackConfigFactory from './webpack/webpack.config';
import previewConfigFactory from './webpack/webpack.preview.config';
import eslintConfig from './eslint/eslintrc';

export const AspectEnvType = 'react';
const jest = require('jest');
const defaultTsConfig = require('./typescript/tsconfig.json');
const buildTsConfig = require('./typescript/tsconfig.build.json');

/**
 * a component environment built for [React](https://reactjs.org) .
 */
export class ReactEnv implements Environment {
  constructor(
    /**
     * jest extension
     */
    private jestAspect: JestMain,

    /**
     * typescript extension.
     */
    private tsAspect: TypescriptMain,

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

    private config: ReactMainConfig,

    private eslint: ESLintMain
  ) {}

  getTsConfig(targetTsConfig?: TsConfigSourceFile) {
    return targetTsConfig ? merge({}, defaultTsConfig, targetTsConfig) : defaultTsConfig;
  }

  getBuildTsConfig(targetTsConfig?: TsConfigSourceFile) {
    return targetTsConfig ? merge({}, buildTsConfig, targetTsConfig) : buildTsConfig;
  }

  /**
   * returns a component tester.
   */
  getTester(jestConfigPath: string, jestModule = jest): Tester {
    const config = jestConfigPath || require.resolve('./jest/jest.config');
    return this.jestAspect.createTester(config, jestModule);
  }

  /**
   * returns a component compiler.
   */
  getCompiler(targetConfig?: any, compilerOptions: Partial<CompilerOptions> = {}, tsModule = ts): Compiler {
    const tsconfig = this.getTsConfig(targetConfig);
    return this.tsAspect.createCompiler(
      {
        tsconfig,
        // TODO: @david please remove this line and refactor to be something that makes sense.
        types: [resolve(pathNormalizeToLinux(__dirname).replace('/dist/', '/src/'), './typescript/style.d.ts')],
        ...compilerOptions,
      },
      tsModule
    );
  }

  /**
   * returns and configures the component linter.
   */
  getLinter() {
    return this.eslint.createLinter({
      config: eslintConfig,
      // resolve all plugins from the react environment.
      pluginPath: __dirname,
    });
  }

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
   * get a schema generator instance configured with the correct tsconfig.
   */
  getSchemaExtractor(tsconfig: TsConfigSourceFile) {
    return this.tsAspect.createSchemaExtractor(this.getTsConfig(tsconfig));
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

  icon = 'https://static.bit.dev/extensions-icons/react.svg';

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
    return this.tsAspect.getPackageJsonProps();
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
        'core-js': '^3.6.5',
        '@types/react': '16.9.43',
        '@types/jest': '~26.0.9',
        '@types/mocha': '-',
        '@types/react-router-dom': '^5.1.5',
      },
      // TODO: take version from config
      peerDependencies: {
        react: '^16.13.1' || this.config.reactVersion,
        'react-dom': '^16.13.1',
      },
    };
  }

  /**
   * returns the component build pipeline.
   */
  getBuildPipe(tsconfig?: TsConfigSourceFile): BuildTask[] {
    return [this.getCompilerTask(tsconfig), this.tester.task];
  }

  private getCompilerTask(tsconfig?: TsConfigSourceFile) {
    const targetConfig = this.getBuildTsConfig(tsconfig);
    return this.compiler.createTask('TypescriptCompiler', this.getCompiler(targetConfig));
  }

  async __getDescriptor() {
    return {
      type: AspectEnvType,
    };
  }
}
