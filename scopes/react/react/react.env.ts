import ts, { TsConfigSourceFile, JsonSourceFile } from 'typescript';
import { tmpdir } from 'os';
import { Component } from '@teambit/component';
import { BuildTask } from '@teambit/builder';
import { merge } from 'lodash';
import { Bundler, BundlerContext, DevServer, DevServerContext } from '@teambit/bundler';
import { CompilerMain, CompilerOptions, Compiler } from '@teambit/compiler';
import { Environment } from '@teambit/envs';
import { JestMain } from '@teambit/jest';
import { PkgMain } from '@teambit/pkg';
import { MDXMain } from '@teambit/mdx';
import { Tester, TesterMain } from '@teambit/tester';
import { TypescriptMain } from '@teambit/typescript';
import { BabelMain } from '@teambit/babel';
import { WebpackMain } from '@teambit/webpack';
import { MultiCompilerMain, MultiCompiler } from '@teambit/multi-compiler';
import { Workspace } from '@teambit/workspace';
import { ESLintMain, EsLintLinter } from '@teambit/eslint';
import { pathNormalizeToLinux } from 'bit-bin/dist/utils';
import { join, resolve } from 'path';
import { outputFileSync } from 'fs-extra';
import { Configuration } from 'webpack';
import { merge as webpackMerge } from 'webpack-merge';
import { ReactMainConfig } from './react.main.runtime';
import webpackConfigFactory from './webpack/webpack.config';
import previewConfigFactory from './webpack/webpack.preview.config';
import eslintConfig from './eslint/eslintrc';
import { UseTypescriptCompilerOptions } from './typescript/interfaces';

export const AspectEnvType = 'react';
const jestM = require('jest');
const defaultTsConfig = require('./typescript/tsconfig.json');
const defaultBabelConfig = require('./babel/babel.config.json');
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
     * typescript extension.
     */
    private babelAspect: BabelMain,

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

    private eslint: ESLintMain,

    private multiCompiler: MultiCompilerMain,

    private mdx: MDXMain
  ) {}

  // base typescript settings - can be overriden via React Main
  tsConfig = defaultTsConfig;
  // tsCompiler = this.getTsCompiler({tsconfig}, )

  getTsWorkspaceCompiler(options: Partial<UseTypescriptCompilerOptions>, tsModule = ts) {
    return this.createTsCompiler(options, tsModule);
  }

  getTsBuildCompiler(options: Partial<UseTypescriptCompilerOptions>, tsModule = ts) {
    return this.createTsCompiler(options, tsModule);
  }

  getTsConfig(targetTsConfig?: TsConfigSourceFile, shouldOverride: Boolean = false) {
    return targetTsConfig
      ? shouldOverride
        ? targetTsConfig
        : merge({}, defaultTsConfig, targetTsConfig)
      : defaultTsConfig;
  }

  getBabelCompiler(babelConfig: JsonSourceFile, options: UseBabelCompilerOptions): Compiler {}

  getBabelConfig(targetBabelConfig?: JsonSourceFile) {
    return targetBabelConfig ? merge({}, defaultBabelConfig, targetBabelConfig) : defaultBabelConfig;
  }

  getBuildTsConfig(targetTsConfig?: TsConfigSourceFile) {
    return targetTsConfig ? merge({}, buildTsConfig, targetTsConfig) : buildTsConfig;
  }

  /**
   * returns a component tester.
   */
  getTester(jestConfigPath: string, jestModule = jestM): Tester {
    const config = jestConfigPath || require.resolve('./jest/jest.config');
    return this.jestAspect.createTester(config, jestModule);
  }

  createTsCompiler(compilerOptions: Partial<UseTypescriptCompilerOptions> = {}, tsModule = ts): Compiler {
    const { overrideExistingConfig, tsconfig: tsconfigFromOptions, ...mainCompilerOptions } = compilerOptions;
    const tsconfig = this.getTsConfig(tsconfigFromOptions, !!overrideExistingConfig);
    const pathToSource = pathNormalizeToLinux(__dirname).replace('/dist/', '/src/');
    const userDefinedTypes = compilerOptions.types
      ? compilerOptions.types.map((path) => resolve(pathToSource, path))
      : [];
    return this.tsAspect.createCompiler(
      {
        tsconfig,
        // TODO: @david please remove this line and refactor to be something that makes sense.
        types: [
          resolve(pathToSource, './typescript/style.d.ts'),
          resolve(pathToSource, './typescript/asset.d.ts'),
          ...userDefinedTypes,
        ],
        ...mainCompilerOptions,
      },
      // @ts-ignore
      tsModule
    );
  }

  createBabelCompiler(targetConfig?: any) {
    return this.babelAspect.createCompiler({ babelTransformOptions: targetConfig });
  }

  createMdxCompiler(targetConfig?: any) {
    return this.mdx.createCompiler({ opts: targetConfig });
  }

  /**
   * returns and configures the component compilers.
   */
  getCompiler(
    targetConfig?: any,
    compilerOptions: Partial<UseTypescriptCompilerOptions> = {},
    tsModule = ts
  ): MultiCompiler {
    let compilers: Compiler[] = [];
    if (this.getTsCompiler()) if (!this.config.mdx) compilers.push(this.mdx.createCompiler());

    return this.multiCompiler.createCompiler(compilers, compilerOptions);
  }

  /**
   * returns and configures the component linter.
   */
  getLinter(): ESLintLinter {
    return this.eslint.createLinter({
      config: eslintConfig,
      // resolve all plugins from the react environment.
      pluginPath: __dirname,
    });
  }

  private getFileMap(components: Component[]) {
    return components.reduce<{ [key: string]: string }>((index, component: Component) => {
      component.state.filesystem.files.forEach((file) => {
        index[file.path] = component.id.toString();
      });

      return index;
    }, {});
  }

  private writeFileMap(components: Component[]) {
    const fileMap = this.getFileMap(components);
    const path = join(tmpdir(), `${Math.random().toString(36).substr(2, 9)}.json`);
    outputFileSync(path, JSON.stringify(fileMap));
    return path;
  }

  /**
   * get the default react webpack config.
   */
  getWebpackConfig(context: DevServerContext): Configuration {
    const fileMapPath = this.writeFileMap(context.components);

    return webpackConfigFactory(context.id, fileMapPath);
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
    const config = targetConfig ? webpackMerge(targetConfig as any, defaultConfig as any) : defaultConfig;

    return this.webpack.createDevServer(context, config);
  }

  async getBundler(context: BundlerContext, targetConfig?: Configuration): Promise<Bundler> {
    const path = this.writeFileMap(context.components);
    const defaultConfig = previewConfigFactory(path);

    if (targetConfig?.entry) {
      const additionalEntries = this.getEntriesFromWebpackConfig(targetConfig);

      const targetsWithGlobalEntries = context.targets.map((target) => {
        // Putting the additionalEntries first to support globals defined there (like regenerator-runtime)
        target.entries = additionalEntries.concat(target.entries);
        return target;
      });
      context.targets = targetsWithGlobalEntries;
    }

    delete targetConfig?.entry;

    const config = targetConfig ? webpackMerge(targetConfig as any, defaultConfig as any) : defaultConfig;
    return this.webpack.createBundler(context, config as any);
  }

  private getEntriesFromWebpackConfig(config?: Configuration): string[] {
    if (!config || !config.entry) {
      return [];
    }
    if (typeof config.entry === 'string') {
      return [config.entry];
    }
    if (Array.isArray(config.entry)) {
      let entries: string[] = [];
      entries = config.entry.reduce((acc, entry) => {
        if (typeof entry === 'string') {
          acc.push(entry);
        }
        return acc;
      }, entries);
      return entries;
    }
    return [];
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
        '@types/node': '^12.12.27',
        'core-js': '^3.6.5',
        '@types/react': '16.9.43',
        '@types/jest': '~26.0.9',
        '@types/mocha': '-',
        '@types/react-router-dom': '^5.1.5',
        // This is added as dev dep since our jest file transformer uses babel plugins that require this to be installed
        '@babel/runtime': '^7.11.2',
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
    return this.compiler.createTask('MultiCompiler', this.getCompiler(targetConfig));
  }

  async __getDescriptor() {
    return {
      type: AspectEnvType,
    };
  }
}
