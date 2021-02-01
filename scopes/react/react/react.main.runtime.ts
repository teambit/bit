import { Configuration } from 'webpack';
import { merge } from 'lodash';
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
import type { TypescriptMain } from '@teambit/typescript';
import { TypescriptAspect } from '@teambit/typescript';
import type { BabelMain } from '@teambit/babel';
import { BabelAspect } from '@teambit/babel';
import { MDXCompilerOpts } from '@teambit/mdx';
import type { WebpackMain } from '@teambit/webpack';
import { WebpackAspect } from '@teambit/webpack';
import { MDXAspect, MDXMain } from '@teambit/mdx';
import { Workspace, WorkspaceAspect } from '@teambit/workspace';
import { MultiCompilerAspect, MultiCompilerMain } from '@teambit/multi-compiler';
import { DevServerContext, BundlerContext } from '@teambit/bundler';
import { VariantPolicyConfigObject } from '@teambit/dependency-resolver';
import ts, { TsConfigSourceFile, JsonSourceFile } from 'typescript';
import { ESLintMain, ESLintAspect } from '@teambit/eslint';
import jest from 'jest';
import { ReactAspect } from './react.aspect';
import { ReactEnv } from './react.env';
import { reactSchema } from './react.graphql';
import { UseTypescriptCompilerOptions, TsConfigs } from './typescript/interfaces';

type ReactDeps = [
  EnvsMain,
  JestMain,
  TypescriptMain,
  BabelMain,
  CompilerMain,
  WebpackMain,
  Workspace,
  GraphqlMain,
  PkgMain,
  TesterMain,
  ESLintMain,
  MultiCompilerMain,
  MDXMain
];

enum ConfigTargets {
  workspace = 'workspace',
  build = 'build',
}

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
   * determine whether to compile MDX files or not.
   * please note this does not apply to component documentation which will work anyway.
   * configure this to `true` when sharing MDX components and MDX file compilation is required.
   */
  mdx: boolean;

  /**
   * version of React to configure.
   */
  reactVersion: string;
};

export class ReactMain {
  constructor(
    /**
     * an instance of the React env.
     */
    readonly reactEnv: ReactEnv,

    private envs: EnvsMain
  ) {}

  readonly env = this.reactEnv;

  private tsConfigOverride: TsConfigSourceFile | undefined; // TODO remove
  private compilers: Compiler[]; // TODO remove

  /**
   * add ts compiler to the compilers array of the React environment.
   * @param configs typeof `TsConfigs` - workspace and build configs to merge with/override original configs
   * @param tsOptions where to apply the config (workspace, build, etc)
   * @param tsModule typeof `ts` module instance.
   */
  useTypescript(
    configs: TsConfigs,
    tsOptions: Partial<UseTypescriptCompilerOptions>,
    tsModule: any = ts
  ): EnvTransformer[] {
    const workspaceCompilerTransformer = this.envs.override({
      getTsWorkspaceCompiler: () => {
        return this.reactEnv.getTsWorkspaceCompiler({ tsconfig: configs.workspaceConfig, ...tsOptions }, tsModule);
      },
    });

    const buildCompilerTransformer = this.envs.override({
      getTsBuildCompiler: () => {
        return this.reactEnv.getTsBuildCompiler(
          { tsconfig: configs.buildConfig || configs.workspaceConfig, ...tsOptions },
          tsModule
        );
      },
    });
    // The following could possibly be passed to centralised functions for all compilers:
    // check targets - if exists apply config to supplied target/s, if doesnt exist apply to all targets
    // create compiler task and add to compiler tasks
    return [workspaceCompilerTransformer, buildCompilerTransformer];
  }

  /**
   * @deprecated replaced by useTsConfig
   * override the TS config of the React environment.
   * @param tsModule typeof `ts` module instance.
   */
  overrideTsConfig(tsconfig: TsConfigSourceFile, tsModule: any = ts) {
    this.tsConfigOverride = tsconfig;

    return this.envs.override({
      getCompiler: () => {
        return this.reactEnv.getCompiler(tsconfig, {}, tsModule);
      },
    });
  }

  /**
   * @deprecated replaced by useTsConfig
   * override the build tsconfig.
   */
  overrideBuildTsConfig(tsconfig) {
    return this.envs.override({
      getBuildPipe: () => {
        return this.reactEnv.getBuildPipe(tsconfig);
      },
    });
  }

  /**
   * adds babel compiler to the compilers array of the React environment.
   * @param babelConfig typeof `JsonSourceFile` config file to merge with original config
   * @param targets where to apply the config (workspace, build, etc)
   */
  useBabel(babelconfig: JsonSourceFile, targets?: ConfigTargets[]) {
    this.compilers.push(this.reactEnv.createBabelCompiler(babelconfig));
    // The following could possibly be passed to centralised functions for all compilers:
    // check targets - if exists apply config to supplied target/s, if doesnt exist apply to all targets
    // create compiler task and add to compiler tasks
  }

  /**
   * adds mdx compiler to the compilers array of the React environment.
   * @param mdxCompilerOptions typeof `MdxCompilerOpts` config file to merge with original config
   * @param targets where to apply the config (workspace, build, etc)
   */
  useMdx(mdxCompilerOptions: MDXCompilerOpts, targets?: ConfigTargets[]) {
    this.compilers.push(this.reactEnv.createMdxCompiler(mdxCompilerOptions));
    // The following could possibly be passed to centralised functions for all compilers:
    // check targets - if exists apply config to supplied target/s, if doesnt exist apply to all targets
    // create compiler task and add to compiler tasks
  }

  /**
   * override the dev server webpack config.
   */
  overrideDevServerConfig(config: Configuration) {
    return this.envs.override({
      getDevServer: (context: DevServerContext) => this.reactEnv.getDevServer(context, config),
    });
  }

  /**
   * create a new composition of the react environment.
   */
  compose(transformers: EnvTransformer[], targetEnv: Environment = {}) {
    return this.envs.compose(this.envs.merge(targetEnv, this.reactEnv), transformers);
  }

  /**
   * override the preview webpack config.
   */
  overridePreviewConfig(config: Configuration) {
    return this.envs.override({
      getBundler: (context: BundlerContext) => this.reactEnv.getBundler(context, config),
    });
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
   * @deprecated replaced by useTsConfig
   * override the build pipeline of the component environment.
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
      getDependencies: () => merge(dependencyPolicy, this.reactEnv.getDependencies()),
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

  overrideCompilers() {
    // pass the compilers array to the multiCompiler.createCompiler function - needs some thought how to make backwards compatible
  }

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
   * overrides the preview compositions mounter.
   * this allows to create a custom DOM mounter for compositions of components.
   */
  // overrideCompositionsMounter(mounterPath: string) {
  //   return this.envs.override({
  //     getMounter: () => {
  //       return mounterPath;
  //     }
  //   });
  // }

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
    BabelAspect,
    CompilerAspect,
    WebpackAspect,
    WorkspaceAspect,
    GraphqlAspect,
    PkgAspect,
    TesterAspect,
    ESLintAspect,
    MultiCompilerAspect,
    MDXAspect,
  ];

  static async provider(
    [
      envs,
      jestAspect,
      tsAspect,
      babelAspect,
      compiler,
      webpack,
      workspace,
      graphql,
      pkg,
      tester,
      eslint,
      multiCompiler,
      mdx,
    ]: ReactDeps,
    config: ReactMainConfig
  ) {
    const reactEnv = new ReactEnv(
      jestAspect,
      tsAspect,
      babelAspect,
      compiler,
      webpack,
      workspace,
      pkg,
      tester,
      config,
      eslint,
      multiCompiler,
      mdx
    );
    const react = new ReactMain(reactEnv, envs);
    graphql.register(reactSchema(react));
    envs.registerEnv(reactEnv);
    return react;
  }
}

ReactAspect.addRuntime(ReactMain);
