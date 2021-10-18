import ts, { TsConfigSourceFile } from 'typescript';
import { tmpdir } from 'os';
import { Component } from '@teambit/component';
import { ComponentUrl } from '@teambit/component.modules.component-url';
import { BuildTask } from '@teambit/builder';
import { merge } from 'lodash';
import { Bundler, BundlerContext, DevServer, DevServerContext } from '@teambit/bundler';
import { CompilerMain } from '@teambit/compiler';
import {
  BuilderEnv,
  CompilerEnv,
  DependenciesEnv,
  DevEnv,
  LinterEnv,
  PackageEnv,
  TesterEnv,
  FormatterEnv,
  PipeServiceModifier,
  PipeServiceModifiersMap,
} from '@teambit/envs';
import { JestMain } from '@teambit/jest';
import { PkgMain } from '@teambit/pkg';
import { Tester, TesterMain } from '@teambit/tester';
import { TsConfigTransformer, TypescriptMain } from '@teambit/typescript';
import type { TypeScriptCompilerOptions } from '@teambit/typescript';
import { WebpackConfigTransformer, WebpackMain } from '@teambit/webpack';
import { Workspace } from '@teambit/workspace';
import { ESLintMain, EslintConfigTransformer } from '@teambit/eslint';
import { PrettierConfigTransformer, PrettierMain } from '@teambit/prettier';
import { Linter, LinterContext } from '@teambit/linter';
import { Formatter, FormatterContext } from '@teambit/formatter';
import { pathNormalizeToLinux } from '@teambit/legacy/dist/utils';
import type { ComponentMeta } from '@teambit/react.babel.bit-react-transformer';
import { SchemaExtractor } from '@teambit/schema';
import { join, resolve } from 'path';
import { outputFileSync } from 'fs-extra';
import { Configuration } from 'webpack';
// Makes sure the @teambit/react.ui.docs-app is a dependency
// TODO: remove this import once we can set policy from component to component with workspace version. Then set it via the component.json
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { ReactMainConfig } from './react.main.runtime';
import { ReactAspect } from './react.aspect';

// webpack configs for both components and envs
import basePreviewConfigFactory from './webpack/webpack.config.base';
import basePreviewProdConfigFactory from './webpack/webpack.config.base.prod';

// webpack configs for envs only
// import devPreviewConfigFactory from './webpack/webpack.config.preview.dev';
import envPreviewDevConfigFactory from './webpack/webpack.config.env.dev';

// webpack configs for components only
import componentPreviewProdConfigFactory from './webpack/webpack.config.component.prod';
import componentPreviewDevConfigFactory from './webpack/webpack.config.component.dev';

export const AspectEnvType = 'react';
const defaultTsConfig = require('./typescript/tsconfig.json');
const buildTsConfig = require('./typescript/tsconfig.build.json');
const eslintConfig = require('./eslint/eslintrc');
const prettierConfig = require('./prettier/prettier.config.js');

// TODO: move to be taken from the key mode of compiler context
type CompilerMode = 'build' | 'dev';

type GetBuildPipeModifiers = PipeServiceModifiersMap & {
  tsModifier?: PipeServiceModifier;
};

/**
 * a component environment built for [React](https://reactjs.org) .
 */
export class ReactEnv
  implements TesterEnv, CompilerEnv, LinterEnv, DevEnv, BuilderEnv, DependenciesEnv, PackageEnv, FormatterEnv
{
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

    private eslint: ESLintMain,

    private prettier: PrettierMain
  ) {}

  getTsConfig(targetTsConfig?: TsConfigSourceFile): TsConfigSourceFile {
    return targetTsConfig ? merge({}, defaultTsConfig, targetTsConfig) : defaultTsConfig;
  }

  getBuildTsConfig(targetTsConfig?: TsConfigSourceFile): TsConfigSourceFile {
    return targetTsConfig ? merge({}, buildTsConfig, targetTsConfig) : buildTsConfig;
  }

  /**
   * returns a component tester.
   */
  getTester(jestConfigPath: string, jestModulePath?: string): Tester {
    const config = jestConfigPath || require.resolve('./jest/jest.config');
    return this.jestAspect.createTester(config, jestModulePath || require.resolve('jest'));
  }

  private getTsCompilerOptions(mode: CompilerMode = 'dev'): TypeScriptCompilerOptions {
    const tsconfig = mode === 'dev' ? defaultTsConfig : buildTsConfig;
    const pathToSource = pathNormalizeToLinux(__dirname).replace('/dist/', '/src/');
    const compileJs = true;
    const compileJsx = true;
    return {
      tsconfig,
      // TODO: @david please remove this line and refactor to be something that makes sense.
      types: [resolve(pathToSource, './typescript/style.d.ts'), resolve(pathToSource, './typescript/asset.d.ts')],
      compileJs,
      compileJsx,
    };
  }

  private getTsCompiler(mode: CompilerMode = 'dev', transformers: TsConfigTransformer[] = [], tsModule = ts) {
    const tsCompileOptions = this.getTsCompilerOptions(mode);
    return this.tsAspect.createCompiler(tsCompileOptions, transformers, tsModule);
  }

  getCompiler(transformers: TsConfigTransformer[] = [], tsModule = ts) {
    return this.getTsCompiler('dev', transformers, tsModule);
  }

  /**
   * returns and configures the component linter.
   */
  getLinter(context: LinterContext, transformers: EslintConfigTransformer[] = []): Linter {
    const defaultTransformer: EslintConfigTransformer = (configMutator) => {
      configMutator.addExtensionTypes(['.md', '.mdx']);
      return configMutator;
    };

    const allTransformers = [defaultTransformer, ...transformers];

    return this.eslint.createLinter(
      context,
      {
        config: eslintConfig,
        // resolve all plugins from the react environment.
        pluginPath: __dirname,
      },
      allTransformers
    );
  }

  /**
   * returns and configures the component formatter.
   */
  getFormatter(context: FormatterContext, transformers: PrettierConfigTransformer[] = []): Formatter {
    return this.prettier.createFormatter(
      context,
      {
        config: prettierConfig,
      },
      transformers
    );
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
   * required for `bit start`
   */
  getDevEnvId(id?: string) {
    if (typeof id !== 'string') return ReactAspect.id;
    return id || ReactAspect.id;
  }

  /**
   * get a schema generator instance configured with the correct tsconfig.
   */
  getSchemaExtractor(tsconfig: TsConfigSourceFile): SchemaExtractor {
    return this.tsAspect.createSchemaExtractor(this.getTsConfig(tsconfig));
  }

  /**
   * returns and configures the React component dev server.
   * required for `bit start`
   */
  getDevServer(context: DevServerContext, transformers: WebpackConfigTransformer[] = []): DevServer {
    const baseConfig = basePreviewConfigFactory(false);
    const envDevConfig = envPreviewDevConfigFactory(context.id);
    const componentsDirs = this.getComponentsModulesDirectories(context.components);
    // const fileMapPath = this.writeFileMap(context.components, true);
    // const componentDevConfig = componentPreviewDevConfigFactory(fileMapPath, this.workspace.path);
    // const componentDevConfig = componentPreviewDevConfigFactory(this.workspace.path, context.id);
    const componentDevConfig = componentPreviewDevConfigFactory(this.workspace.path, context.id, componentsDirs);

    const defaultTransformer: WebpackConfigTransformer = (configMutator) => {
      const merged = configMutator.merge([baseConfig, envDevConfig, componentDevConfig]);
      return merged;
    };

    return this.webpack.createDevServer(context, [defaultTransformer, ...transformers]);
  }

  async getBundler(context: BundlerContext, transformers: WebpackConfigTransformer[] = []): Promise<Bundler> {
    // const fileMapPath = this.writeFileMap(context.components);
    const baseConfig = basePreviewConfigFactory(true);
    const baseProdConfig = basePreviewProdConfigFactory();
    // const componentProdConfig = componentPreviewProdConfigFactory(fileMapPath);
    const componentProdConfig = componentPreviewProdConfigFactory();

    const defaultTransformer: WebpackConfigTransformer = (configMutator) => {
      const merged = configMutator.merge([baseConfig, baseProdConfig, componentProdConfig]);
      return merged;
    };

    return this.webpack.createBundler(context, [defaultTransformer, ...transformers]);
  }

  private getComponentsModulesDirectories(components: Component[]): string[] {
    const dirs = components.map((component) => {
      return this.pkg.getModulePath(component, { absPath: true });
    });
    return dirs;
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
   * returns a path to a docs template.
   */
  getDocsTemplate() {
    return require.resolve('@teambit/react.ui.docs-app');
  }

  icon = 'https://static.bit.dev/extensions-icons/react.svg';

  /**
   * returns a paths to a function which mounts a given component to DOM
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
  getDependencies() {
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
        '@types/react': '^17.0.8',
        '@types/react-dom': '^17.0.5',
        '@types/jest': '^26.0.0',
        // '@types/react-router-dom': '^5.0.0', // TODO - should not be here (!)
        // This is added as dev dep since our jest file transformer uses babel plugins that require this to be installed
        '@babel/runtime': '7.12.18',
        '@types/testing-library__jest-dom': '5.9.5',
      },
      peerDependencies: {
        react: '^16.8.0 || ^17.0.0',
        'react-dom': '^16.8.0 || ^17.0.0',
      },
    };
  }

  /**
   * returns the component build pipeline.
   */
  getBuildPipe(modifiers: GetBuildPipeModifiers = {}): BuildTask[] {
    const transformers: TsConfigTransformer[] =
      (modifiers?.tsModifier?.transformers as any as TsConfigTransformer[]) || [];
    return [this.getCompilerTask(transformers, modifiers?.tsModifier?.module || ts), this.tester.task];
  }

  private getCompilerTask(transformers: TsConfigTransformer[] = [], tsModule = ts) {
    const tsCompiler = this.getTsCompiler('build', transformers, tsModule);
    return this.compiler.createTask('TSCompiler', tsCompiler);
  }

  async __getDescriptor() {
    return {
      type: AspectEnvType,
    };
  }
}
