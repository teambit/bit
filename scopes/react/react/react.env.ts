import ts, { TsConfigSourceFile } from 'typescript';
import { tmpdir } from 'os';
import { Component } from '@teambit/component';
import { ComponentUrl } from '@teambit/component.modules.component-url';
import { BuildTask } from '@teambit/builder';
import { camelCase, merge, omit } from 'lodash';
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

// webpack configs for both components and envs
import basePreviewConfigFactory from './webpack/webpack.config.base';
import basePreviewProdConfigFactory from './webpack/webpack.config.base.prod';

// webpack configs for envs only
// import devPreviewConfigFactory from './webpack/webpack.config.preview.dev';
import envPreviewBaseConfigFactory from './webpack/webpack.config.env.base';
import envPreviewDevConfigFactory from './webpack/webpack.config.env.dev';

// webpack configs for components only
import componentPreviewBaseConfigFactory from './webpack/webpack.config.component.base';
import componentPreviewProdConfigFactory from './webpack/webpack.config.component.prod';
import componentPreviewDevConfigFactory from './webpack/webpack.config.component.dev';

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
    console.log('context.entry', context.entry);
    const baseConfig = basePreviewConfigFactory(false);
    const mfName = camelCase(`${context.id.toString()}_MF`);
    // TODO: take the port dynamically
    const port = context.port;
    const rootPath = context.rootPath;

    const envBaseConfig = envPreviewBaseConfigFactory(mfName, 'http://localhost', port, rootPath || '');
    console.log('envBaseConfig', require('util').inspect(envBaseConfig, { depth: 10 }));

    const envDevConfig = envPreviewDevConfigFactory(context.id);

    const fileMapPath = this.writeFileMap(context.components, true);

    const componentBaseConfig = componentPreviewBaseConfigFactory(mfName, context.exposes);
    const componentDevConfig = componentPreviewDevConfigFactory(fileMapPath, this.workspace.path);
    // const defaultConfig = this.getDevWebpackConfig(context);
    const defaultTransformer: WebpackConfigTransformer = (configMutator) => {
      const merged = configMutator.merge([
        baseConfig,
        envBaseConfig,
        envDevConfig,
        componentBaseConfig,
        componentDevConfig,
      ]);
      const allMfInstances = merged.raw.plugins?.filter(
        (plugin) => plugin.constructor.name === 'ModuleFederationPlugin'
      );
      if (!allMfInstances || allMfInstances?.length < 2) {
        return merged;
      }
      const mergedMfConfig = allMfInstances.reduce((acc, curr) => {
        // @ts-ignore
        return Object.assign(acc, curr._options);
      }, {});
      // @ts-ignore
      allMfInstances[0]._options = mergedMfConfig;
      const mutatedPlugins = merged.raw.plugins?.filter(
        (plugin) => plugin.constructor.name !== 'ModuleFederationPlugin'
      );
      mutatedPlugins?.push(allMfInstances[0]);
      merged.raw.plugins = mutatedPlugins;
      return merged;
    };

    return this.webpack.createDevServer(context, [defaultTransformer, ...transformers]);
  }

  /**
   * returns and configures the React component dev server.
   */
  // getEnvDevServer(context: DevServerContext, transformers: WebpackConfigTransformer[] = []): DevServer {
  //   console.log('context.entry', context.entry);
  //   const baseConfig = basePreviewConfigFactory(false);
  //   const envBaseConfig = envPreviewBaseConfigFactory();
  //   const envDevConfig = envPreviewDevConfigFactory(context.id);
  //   // const defaultConfig = this.getDevWebpackConfig(context);
  //   const defaultTransformer: WebpackConfigTransformer = (configMutator) => {
  //     return configMutator.merge([baseConfig, envBaseConfig, envDevConfig]);
  //   };

  //   return this.webpack.createDevServer(context, [defaultTransformer, ...transformers]);
  // }

  /**
   * returns and configures the React component dev server.
   */
  // getComponentsDevServers(context: DevServerContext, transformers: WebpackConfigTransformer[] = []): DevServer {
  //   // const defaultConfig = this.getDevWebpackConfig(context);
  //   const fileMapPath = this.writeFileMap(context.components, true);
  //   const mfName = camelCase(`${context.id.toString()}_MF`);
  //   const baseConfig = basePreviewConfigFactory(false);

  //   const componentBaseConfig = componentPreviewBaseConfigFactory(mfName);
  //   const componentDevConfig = componentPreviewDevConfigFactory(fileMapPath, this.workspace.path);
  //   const defaultTransformer: WebpackConfigTransformer = (configMutator) => {
  //     return configMutator.merge([baseConfig, componentBaseConfig, componentDevConfig]);
  //   };

  //   return this.webpack.createDevServer(context, [defaultTransformer, ...transformers]);
  // }

  async getEnvBundler(context: BundlerContext, transformers: WebpackConfigTransformer[] = []): Promise<Bundler> {
    const baseConfig = basePreviewConfigFactory(true);
    const baseProdConfig = basePreviewProdConfigFactory();
    const defaultConfig = envPreviewProdConfigFactory();
    const defaultTransformer: WebpackConfigTransformer = (configMutator) => {
      return configMutator.merge([baseConfig, baseProdConfig, defaultConfig]);
    };

    return this.webpack.createBundler(context, [defaultTransformer, ...transformers]);
  }

  async getComponentBundler(context: BundlerContext, transformers: WebpackConfigTransformer[] = []): Promise<Bundler> {
    const fileMapPath = this.writeFileMap(context.components);
    const baseConfig = basePreviewConfigFactory(true);
    const baseProdConfig = basePreviewProdConfigFactory();
    const prodComponentConfig = componentPreviewProdConfigFactory(fileMapPath);
    const defaultTransformer: WebpackConfigTransformer = (configMutator, mutatorContext) => {
      if (!mutatorContext.target?.mfName) {
        throw new Error(`missing module federation name for ${mutatorContext.target?.components[0].id.toString()}`);
      }
      const baseComponentConfig = componentPreviewBaseConfigFactory(
        mutatorContext.target?.mfName,
        mutatorContext.target?.mfExposes
      );

      return configMutator.merge([baseConfig, baseProdConfig, baseComponentConfig, prodComponentConfig]);
    };

    return this.webpack.createComponentsBundler(context, [defaultTransformer, ...transformers]);
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
  getBuildPipe(
    tsconfig?: TsConfigSourceFile,
    compilerOptions: Partial<TsCompilerOptionsWithoutTsConfig> = {},
    tsModule = ts
  ): BuildTask[] {
    return [this.getCompilerTask(tsconfig, compilerOptions, tsModule), this.tester.task];
  }

  private getCompilerTask(
    tsconfig?: TsConfigSourceFile,
    compilerOptions: Partial<TsCompilerOptionsWithoutTsConfig> = {},
    tsModule = ts
  ) {
    const targetConfig = this.getBuildTsConfig(tsconfig);
    return this.compiler.createTask('TSCompiler', this.getCompiler(targetConfig, compilerOptions, tsModule));
  }

  async __getDescriptor() {
    return {
      type: AspectEnvType,
    };
  }
}
