import ts, { TsConfigSourceFile } from 'typescript';
import { tmpdir } from 'os';
import { Component } from '@teambit/component';
import { ComponentUrl } from '@teambit/component.modules.component-url';
import { BuildTask } from '@teambit/builder';
import { merge, omit } from 'lodash';
import { Bundler, BundlerContext, DevServer, DevServerContext } from '@teambit/bundler';
import { CompilerMain } from '@teambit/compiler';
import { Environment } from '@teambit/envs';
import { JestMain } from '@teambit/jest';
import { PkgMain } from '@teambit/pkg';
import { Tester, TesterMain } from '@teambit/tester';
import { TypescriptMain } from '@teambit/typescript';
import type { TsCompilerOptionsWithoutTsConfig } from '@teambit/typescript';
import { WebpackConfigTransformer, WebpackMain } from '@teambit/webpack';
import { Workspace } from '@teambit/workspace';
import { ESLintMain } from '@teambit/eslint';
import { pathNormalizeToLinux } from '@teambit/legacy/dist/utils';
import type { ComponentMeta } from '@teambit/react.babel.bit-react-transformer';
import { join, resolve } from 'path';
import { outputFileSync } from 'fs-extra';
import { Configuration } from 'webpack';
import { ReactMainConfig } from './react.main.runtime';
import devPreviewConfigFactory from './webpack/webpack.config.preview.dev';
import previewConfigFactory from './webpack/webpack.config.preview';
import { eslintConfig } from './eslint/eslintrc';
import { ReactAspect } from './react.aspect';

export const AspectEnvType = 'react';
const jestM = require('jest');
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
  getTester(jestConfigPath: string, jestModule = jestM): Tester {
    const config = jestConfigPath || require.resolve('./jest/jest.config');
    return this.jestAspect.createTester(config, jestModule);
  }

  createTsCompiler(targetConfig?: any, compilerOptions: Partial<TsCompilerOptionsWithoutTsConfig> = {}, tsModule = ts) {
    const tsconfig = this.getTsConfig(targetConfig);
    const pathToSource = pathNormalizeToLinux(__dirname).replace('/dist/', '/src/');
    const additionalTypes = compilerOptions.types || [];
    const compileJs = compilerOptions.compileJs ?? true;
    const compileJsx = compilerOptions.compileJsx ?? true;
    const genericCompilerOptions = omit(compilerOptions, ['types', 'compileJs', 'compileJsx']);
    return this.tsAspect.createCompiler(
      {
        tsconfig,
        // TODO: @david please remove this line and refactor to be something that makes sense.
        types: [
          resolve(pathToSource, './typescript/style.d.ts'),
          resolve(pathToSource, './typescript/asset.d.ts'),
          ...additionalTypes,
        ],
        compileJs,
        compileJsx,
        ...genericCompilerOptions,
      },
      // @ts-ignore
      tsModule
    );
  }

  getCompiler(targetConfig?: any, compilerOptions: Partial<TsCompilerOptionsWithoutTsConfig> = {}, tsModule = ts) {
    return this.createTsCompiler(targetConfig, compilerOptions, tsModule);
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

  private getFileMap(components: Component[], local = false) {
    return components.reduce<{ [key: string]: ComponentMeta }>((index, component: Component) => {
      component.state.filesystem.files.forEach((file) => {
        index[file.path] = {
          id: component.id.toString(),
          homepage: local ? `/${component.id.fullName}` : ComponentUrl.toUrl(component.id),
        };
      });

      return index;
    }, {});
  }

  private writeFileMap(components: Component[], local?: boolean) {
    const fileMap = this.getFileMap(components, local);
    const path = join(tmpdir(), `${Math.random().toString(36).substr(2, 9)}.json`);
    outputFileSync(path, JSON.stringify(fileMap));
    return path;
  }

  /**
   * get the default react webpack config.
   */
  private getDevWebpackConfig(context: DevServerContext): Configuration {
    const fileMapPath = this.writeFileMap(context.components, true);

    return devPreviewConfigFactory({ envId: context.id, fileMapPath, workDir: this.workspace.path });
  }

  getDevEnvId(id?: string) {
    if (typeof id !== 'string') return ReactAspect.id;
    return id || ReactAspect.id;
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
  getDevServer(context: DevServerContext, transformers: WebpackConfigTransformer[] = []): DevServer {
    const defaultConfig = this.getDevWebpackConfig(context);
    const defaultTransformer: WebpackConfigTransformer = (configMutator) => {
      return configMutator.merge([defaultConfig]);
    };

    return this.webpack.createDevServer(context, [defaultTransformer, ...transformers]);
  }

  async getBundler(context: BundlerContext, transformers: WebpackConfigTransformer[] = []): Promise<Bundler> {
    const path = this.writeFileMap(context.components);
    const defaultConfig = previewConfigFactory(path);
    const defaultTransformer: WebpackConfigTransformer = (configMutator) => {
      return configMutator.merge([defaultConfig]);
    };

    return this.webpack.createBundler(context, [defaultTransformer, ...transformers]);
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
        'react-dom': '-',
        'core-js': '^3.0.0',
      },
      // TODO: add this only if using ts
      devDependencies: {
        react: '-',
        'react-dom': '-',
        '@types/mocha': '-',
        '@types/node': '12.20.4',
        '@types/react': '^16.8.0',
        '@types/jest': '^26.0.0',
        // '@types/react-router-dom': '^5.0.0', // TODO - should not be here (!)
        // This is added as dev dep since our jest file transformer uses babel plugins that require this to be installed
        '@babel/runtime': '7.12.18',
      },
      // TODO: take version from config
      peerDependencies: {
        react: '^16.8.0 || ^17.0.0',
        'react-dom': '^16.8.0 || ^17.0.0',
      },
    };
  }

  /**
   * returns the component build pipeline.
   */
  getBuildPipe(
    tsconfig?: TsConfigSourceFile,
    compilerOptions: Partial<TsCompilerOptionsWithoutTsConfig> = {}
  ): BuildTask[] {
    return [this.getCompilerTask(tsconfig, compilerOptions), this.tester.task];
  }

  private getCompilerTask(
    tsconfig?: TsConfigSourceFile,
    compilerOptions: Partial<TsCompilerOptionsWithoutTsConfig> = {}
  ) {
    const targetConfig = this.getBuildTsConfig(tsconfig);
    return this.compiler.createTask('TSCompiler', this.getCompiler(targetConfig, compilerOptions));
  }

  async __getDescriptor() {
    return {
      type: AspectEnvType,
    };
  }
}
