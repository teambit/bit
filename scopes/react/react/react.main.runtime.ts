import mergeDeepLeft from 'ramda/src/mergeDeepLeft';
import { omit } from 'lodash';
import { MainRuntime } from '@teambit/cli';
import type { CompilerMain } from '@teambit/compiler';
import { CompilerAspect, Compiler } from '@teambit/compiler';
import { BuildTask } from '@teambit/builder';
import { Component } from '@teambit/component';
import { EnvsAspect, EnvsMain, EnvTransformer, Environment } from '@teambit/envs';
import type { GraphqlMain } from '@teambit/graphql';
import { GraphqlAspect } from '@teambit/graphql';
import type { JestMain } from '@teambit/jest';
import { JestAspect } from '@teambit/jest';
import type { PkgMain, PackageJsonProps } from '@teambit/pkg';
import { PkgAspect } from '@teambit/pkg';
import type { TesterMain } from '@teambit/tester';
import { TesterAspect } from '@teambit/tester';
import type { TypescriptMain, TsCompilerOptionsWithoutTsConfig, TsConfigTransformer } from '@teambit/typescript';
import { TypescriptAspect } from '@teambit/typescript';
import type { WebpackMain, Configuration, WebpackConfigTransformer } from '@teambit/webpack';
import { WebpackAspect } from '@teambit/webpack';
import { GeneratorAspect, GeneratorMain } from '@teambit/generator';
import { Workspace, WorkspaceAspect } from '@teambit/workspace';
import { DevServerContext, BundlerContext } from '@teambit/bundler';
import { DependencyResolverAspect, DependencyResolverMain, EnvPolicyConfigObject } from '@teambit/dependency-resolver';
import ts from 'typescript';
import { ApplicationAspect, ApplicationMain } from '@teambit/application';
import { FormatterContext } from '@teambit/formatter';
import { LinterContext } from '@teambit/linter';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import { ESLintMain, ESLintAspect, EslintConfigTransformer } from '@teambit/eslint';
import { PrettierMain, PrettierAspect, PrettierConfigTransformer } from '@teambit/prettier';
import { ReactAspect } from './react.aspect';
import { ReactEnv } from './react.env';
import { ReactAppType } from './apps/web';
import { reactSchema } from './react.graphql';
import { componentTemplates, workspaceTemplates } from './react.templates';
import { ReactAppOptions } from './apps/web/react-app-options';

type ReactDeps = [
  EnvsMain,
  JestMain,
  TypescriptMain,
  CompilerMain,
  WebpackMain,
  Workspace,
  GraphqlMain,
  PkgMain,
  TesterMain,
  ESLintMain,
  PrettierMain,
  ApplicationMain,
  GeneratorMain,
  DependencyResolverMain,
  LoggerMain
];

export type ReactMainConfig = {
  /**
   * configure the react env compiler.
   * can be configured to either TypeScript ('ts') or Babel ('babel').
   */
  compiler: 'babel' | 'ts';

  /**
   * configure the component tester.
   * can be either Jest ('jest') or Mocha ('mocha')
   */
  tester: 'jest' | 'mocha';

  /**
   * version of React to configure.
   */
  reactVersion: string;

  /**
   * configure default typescript compiler options(for all modes)
   */
  tsCompilerOptions?: ts.CompilerOptions;
};

export type UseWebpackModifiers = {
  previewConfig?: WebpackConfigTransformer[];
  devServerConfig?: WebpackConfigTransformer[];
};

export type UseTypescriptModifiers = {
  buildConfig?: TsConfigTransformer[];
  devConfig?: TsConfigTransformer[];
};

export type UseEslintModifiers = {
  transformers: EslintConfigTransformer[];
};
export type UsePrettierModifiers = {
  transformers: PrettierConfigTransformer[];
};

export class ReactMain {
  constructor(
    /**
     * an instance of the React env.
     */
    readonly reactEnv: ReactEnv,

    private envs: EnvsMain,

    private application: ApplicationMain,

    private reactAppType: ReactAppType,

    private dependencyResolver: DependencyResolverMain,

    private logger: Logger
  ) {}

  readonly env = this.reactEnv;

  getReactAppType(name: string) {
    return new ReactAppType(name, this.reactEnv, this.logger, this.dependencyResolver);
  }

  /**
   * use this to register apps programmatically.
   */
  async registerApp(reactApp: ReactAppOptions) {
    return this.application.registerApp(this.reactAppType.createApp(reactApp));
  }

  /**
   * override the env's typescript config for both dev and build time.
   * Replaces both overrideTsConfig (devConfig) and overrideBuildTsConfig (buildConfig)
   */
  useTypescript(modifiers?: UseTypescriptModifiers, tsModule: any = ts) {
    const overrides: any = {};
    const devTransformers = modifiers?.devConfig;
    if (devTransformers) {
      overrides.getCompiler = () => this.reactEnv.getCompiler(devTransformers, tsModule);
    }
    const buildTransformers = modifiers?.buildConfig;
    if (buildTransformers) {
      const buildPipeModifiers = {
        tsModifier: {
          transformers: buildTransformers,
          module: tsModule,
        },
      };
      overrides.getBuildPipe = () => this.reactEnv.getBuildPipe(buildPipeModifiers);
    }
    return this.envs.override(overrides);
  }

  /**
   * @deprecated use useTypescript()
   * override the TS config of the React environment.
   * @param tsModule typeof `ts` module instance.
   */
  overrideTsConfig(
    tsconfig: Record<string, any> = {},
    compilerOptions: Partial<TsCompilerOptionsWithoutTsConfig> = {},
    tsModule: any = ts
  ) {
    const transformer: TsConfigTransformer = (configMutator) => {
      configMutator.mergeTsConfig(tsconfig);
      configMutator.raw.compileJs = compilerOptions.compileJs ?? configMutator.raw.compileJs;
      configMutator.raw.compileJsx = compilerOptions.compileJsx ?? configMutator.raw.compileJsx;
      if (compilerOptions.types) {
        configMutator.addTypes(compilerOptions.types);
      }
      const genericCompilerOptions = omit(compilerOptions, ['types', 'compileJs', 'compileJsx']);
      configMutator.raw = Object.assign(configMutator.raw, genericCompilerOptions);
      return configMutator;
    };
    // return this.envs.override({
    //   getCompiler: () => this.reactEnv.getCompiler([transformer], tsModule),
    // });
    return this.useTypescript({ devConfig: [transformer] }, tsModule);
  }

  /**
   * Override the Bit documentation link. See docs: https://bit.dev/docs/docs/doc-templates
   */
  overrideDocsTemplate(templatePath: string) {
    return this.envs.override({
      getDevEnvId: (context: DevServerContext) => this.reactEnv.getDevEnvId(context.envDefinition.id),
      getDocsTemplate: () => templatePath,
    });
  }

  /**
   * @deprecated use useTypescript()
   * override the build tsconfig.
   */
  overrideBuildTsConfig(
    tsconfig: Record<string, any> = {},
    compilerOptions: Partial<TsCompilerOptionsWithoutTsConfig> = {},
    tsModule: any = ts
  ) {
    const transformer: TsConfigTransformer = (configMutator) => {
      configMutator.mergeTsConfig(tsconfig);
      configMutator.raw.compileJs = compilerOptions.compileJs ?? configMutator.raw.compileJs;
      configMutator.raw.compileJsx = compilerOptions.compileJsx ?? configMutator.raw.compileJsx;
      if (compilerOptions.types) {
        configMutator.addTypes(compilerOptions.types);
      }
      const genericCompilerOptions = omit(compilerOptions, ['types', 'compileJs', 'compileJsx']);
      configMutator.raw = Object.assign(configMutator.raw, genericCompilerOptions);
      return configMutator;
    };
    // return this.envs.override({
    //   getBuildPipe: () => this.reactEnv.getBuildPipe([transformer], tsModule),
    // });
    return this.useTypescript({ buildConfig: [transformer] }, tsModule);
  }

  /**
   * override the env's dev server and preview webpack configurations.
   * Replaces both overrideDevServerConfig and overridePreviewConfig
   */
  useWebpack(modifiers?: UseWebpackModifiers): EnvTransformer {
    const overrides: any = {};
    const devServerTransformers = modifiers?.devServerConfig;
    if (devServerTransformers) {
      overrides.getDevServer = (context: DevServerContext) =>
        this.reactEnv.getDevServer(context, devServerTransformers);
      overrides.getDevEnvId = (context: DevServerContext) => this.reactEnv.getDevEnvId(context.envDefinition.id);
    }
    const previewTransformers = modifiers?.previewConfig;
    if (previewTransformers) {
      overrides.getBundler = (context: BundlerContext) => this.reactEnv.getBundler(context, previewTransformers);
    }
    return this.envs.override(overrides);
  }

  /**
   * An API to mutate the prettier config
   * @param modifiers
   * @returns
   */
  useEslint(modifiers?: UseEslintModifiers): EnvTransformer {
    const transformers = modifiers?.transformers || [];
    return this.envs.override({
      getLinter: (context: LinterContext) => this.reactEnv.getLinter(context, transformers),
    });
  }

  /**
   * An API to mutate the prettier config
   * @param modifiers
   * @returns
   */
  usePrettier(modifiers?: UsePrettierModifiers): EnvTransformer {
    const transformers = modifiers?.transformers || [];
    return this.envs.override({
      getFormatter: (context: FormatterContext) => this.reactEnv.getFormatter(context, transformers),
    });
  }

  /**
   * @deprecated use useWebpack()
   * override the dev server webpack config.
   */
  overrideDevServerConfig(config: Configuration) {
    const transformer: WebpackConfigTransformer = (configMutator) => {
      return configMutator.merge([config]);
    };

    return this.envs.override({
      getDevServer: (context: DevServerContext) => this.reactEnv.getDevServer(context, [transformer]),
      getDevEnvId: (context: DevServerContext) => this.reactEnv.getDevEnvId(context.envDefinition.id),
    });
  }

  /**
   * @deprecated use useWebpack()
   * override the preview webpack config.
   */
  overridePreviewConfig(config: Configuration) {
    const transformer: WebpackConfigTransformer = (configMutator) => {
      return configMutator.merge([config]);
    };
    return this.envs.override({
      getBundler: (context: BundlerContext) => this.reactEnv.getBundler(context, [transformer]),
    });
  }

  overrideMounter(mounterPath: string) {
    return this.envs.override({
      getMounter: () => {
        return mounterPath;
      },
    });
  }

  /**
   * create a new composition of the react environment.
   */
  compose(transformers: EnvTransformer[], targetEnv: Environment = {}) {
    return this.envs.compose(this.envs.merge(targetEnv, this.reactEnv), transformers);
  }

  /**
   * override the jest configuration.
   * @param jestConfigPath {typeof jest} absolute path to jest.config.json.
   * @param jestModulePath absolute path to jest
   */
  overrideJestConfig(jestConfigPath: string, jestModulePath?: string) {
    return this.envs.override({
      getTester: () => this.reactEnv.getTester(jestConfigPath, jestModulePath),
    });
  }

  /**
   * override the build pipeline of the component environment.
   */
  overrideBuildPipe(tasks: BuildTask[]) {
    return this.envs.override({
      getBuildPipe: () => tasks,
    });
  }

  /**
   * override the compiler tasks inside the build pipeline of the component environment.
   */
  overrideCompilerTasks(tasks: BuildTask[]) {
    const pipeWithoutCompiler = this.reactEnv.getBuildPipeWithoutCompiler();

    return this.envs.override({
      getBuildPipe: () => [...tasks, ...pipeWithoutCompiler],
    });
  }

  /**
   * override the dependency configuration of the component environment.
   */
  overrideDependencies(dependencyPolicy: EnvPolicyConfigObject) {
    return this.envs.override({
      getDependencies: async () => {
        const reactDeps = await this.reactEnv.getDependencies();
        return mergeDeepLeft(dependencyPolicy, reactDeps);
      },
    });
  }

  /**
   * override the workspace compiler.
   */
  overrideCompiler(compiler: Compiler) {
    return this.envs.override({
      getCompiler: () => {
        return compiler;
      },
    });
  }

  /**
   * TODO: @gilad we need to implement this.
   */
  overrideEslintConfig() {}

  /**
   * override the package json props of the component environment.
   */
  overridePackageJsonProps(props: PackageJsonProps) {
    return this.envs.override({
      getPackageJsonProps: () => {
        return {
          ...this.reactEnv.getPackageJsonProps(),
          ...props,
        };
      },
    });
  }

  /**
   * returns doc adjusted specifically for react components.
   */
  getDocs(component: Component) {
    const docsArray = component.state._consumer.docs;
    if (!docsArray || !docsArray[0]) {
      return null;
    }

    const docs = docsArray[0];

    return {
      abstract: docs.description,
      filePath: docs.filePath,
      properties: docs.properties,
    };
  }

  static runtime = MainRuntime;
  static dependencies = [
    EnvsAspect,
    JestAspect,
    TypescriptAspect,
    CompilerAspect,
    WebpackAspect,
    WorkspaceAspect,
    GraphqlAspect,
    PkgAspect,
    TesterAspect,
    ESLintAspect,
    PrettierAspect,
    ApplicationAspect,
    GeneratorAspect,
    DependencyResolverAspect,
    LoggerAspect,
  ];

  static async provider(
    [
      envs,
      jestAspect,
      tsAspect,
      compiler,
      webpack,
      workspace,
      graphql,
      pkg,
      tester,
      eslint,
      prettier,
      application,
      generator,
      dependencyResolver,
      loggerMain,
    ]: ReactDeps,
    config: ReactMainConfig
  ) {
    const logger = loggerMain.createLogger(ReactAspect.id);
    const reactEnv = new ReactEnv(
      jestAspect,
      tsAspect,
      compiler,
      webpack,
      workspace,
      pkg,
      tester,
      config,
      eslint,
      prettier,
      dependencyResolver,
      logger,
      CompilerAspect.id
    );
    const appType = new ReactAppType('react-app', reactEnv, logger, dependencyResolver);
    const react = new ReactMain(reactEnv, envs, application, appType, dependencyResolver, logger);
    graphql.register(reactSchema(react));
    envs.registerEnv(reactEnv);
    generator.registerComponentTemplate(componentTemplates);
    generator.registerWorkspaceTemplate(workspaceTemplates);
    application.registerAppType(appType);

    return react;
  }
}

ReactAspect.addRuntime(ReactMain);
