import { mergeDeepLeft } from 'ramda';
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
import type { TypescriptMain, TsCompilerOptionsWithoutTsConfig } from '@teambit/typescript';
import { TypescriptAspect } from '@teambit/typescript';
import type { WebpackMain, Configuration, WebpackConfigTransformer } from '@teambit/webpack';
import { WebpackAspect } from '@teambit/webpack';
import { GeneratorAspect, GeneratorMain } from '@teambit/generator';
import { Workspace, WorkspaceAspect } from '@teambit/workspace';
import { DevServerContext, BundlerContext } from '@teambit/bundler';
import { VariantPolicyConfigObject } from '@teambit/dependency-resolver';
import ts, { TsConfigSourceFile } from 'typescript';
import { ApplicationAspect, ApplicationMain } from '@teambit/application';
import { ESLintMain, ESLintAspect } from '@teambit/eslint';
import jest from 'jest';
import { ReactAspect } from './react.aspect';
import { ReactEnv } from './react.env';
import { reactSchema } from './react.graphql';
import { ReactAppOptions } from './react-app-options';
import { ReactApp } from './react.application';
import { componentTemplates, workspaceTemplates } from './react.templates';

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
  ApplicationMain,
  GeneratorMain
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
};

export type UseWebpackModifiers = {
  previewConfig?: WebpackConfigTransformer[];
  devServerConfig?: WebpackConfigTransformer[];
};

export class ReactMain {
  constructor(
    /**
     * an instance of the React env.
     */
    readonly reactEnv: ReactEnv,

    private envs: EnvsMain,

    private application: ApplicationMain,

    private workspace: Workspace
  ) {}

  readonly env = this.reactEnv;

  private tsConfigOverride: TsConfigSourceFile | undefined;

  /**
   * override the TS config of the React environment.
   * @param tsModule typeof `ts` module instance.
   */
  overrideTsConfig(
    tsconfig: TsConfigSourceFile,
    compilerOptions: Partial<TsCompilerOptionsWithoutTsConfig> = {},
    tsModule: any = ts
  ) {
    this.tsConfigOverride = tsconfig;

    return this.envs.override({
      getCompiler: () => {
        return this.reactEnv.getCompiler(tsconfig, compilerOptions, tsModule);
      },
    });
  }

  /**
   * override the build tsconfig.
   */
  overrideBuildTsConfig(tsconfig, compilerOptions: Partial<TsCompilerOptionsWithoutTsConfig> = {}) {
    return this.envs.override({
      getBuildPipe: () => {
        return this.reactEnv.getBuildPipe(tsconfig, compilerOptions);
      },
    });
  }

  /**
   * register a new React application.
   */
  registerReactApp(options: ReactAppOptions) {
    if (!this.workspace) return;
    this.application.registerApp(
      new ReactApp(
        options.name,
        options.buildEntry,
        options.runEntry,
        options.portRange || [3000, 4000],
        this.reactEnv,
        this.workspace.path,
        options.deploy
      )
    );
  }

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

  /**
   * create a new composition of the react environment.
   */
  compose(transformers: EnvTransformer[], targetEnv: Environment = {}) {
    return this.envs.compose(this.envs.merge(targetEnv, this.reactEnv), transformers);
  }

  /**
   * override the jest configuration.
   * @param jestConfigPath {typeof jest} absolute path to jest.config.json.
   */
  overrideJestConfig(jestConfigPath: string, jestModule: any = jest) {
    return this.envs.override({
      getTester: () => this.reactEnv.getTester(jestConfigPath, jestModule),
    });
  }

  /**
   * return the computed tsconfig.
   */
  getTsConfig() {
    return this.reactEnv.getTsConfig(this.tsConfigOverride);
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
    const pipeWithoutCompiler = this.reactEnv.getBuildPipe().filter((task) => task.aspectId !== CompilerAspect.id);

    return this.envs.override({
      getBuildPipe: () => [...tasks, ...pipeWithoutCompiler],
    });
  }

  /**
   * override the dependency configuration of the component environment.
   */
  overrideDependencies(dependencyPolicy: VariantPolicyConfigObject) {
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
          ...props,
          ...this.reactEnv.getPackageJsonProps(),
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
    ApplicationAspect,
    GeneratorAspect,
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
      application,
      generator,
    ]: ReactDeps,
    config: ReactMainConfig
  ) {
    const reactEnv = new ReactEnv(jestAspect, tsAspect, compiler, webpack, workspace, pkg, tester, config, eslint);
    const react = new ReactMain(reactEnv, envs, application, workspace);
    graphql.register(reactSchema(react));
    envs.registerEnv(reactEnv);
    generator.registerComponentTemplate(componentTemplates);
    generator.registerWorkspaceTemplate(workspaceTemplates);
    return react;
  }
}

ReactAspect.addRuntime(ReactMain);
