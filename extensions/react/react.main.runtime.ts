import { Configuration } from 'webpack';
import { merge } from 'lodash';
import { MainRuntime } from '@teambit/cli';
import type { CompilerMain } from '@teambit/compiler';
import { CompilerAspect } from '@teambit/compiler';
import { BuildTask } from '@teambit/builder';
import { Component } from '@teambit/component';
import { EnvsAspect, EnvsMain, EnvTransformer, Environment } from '@teambit/environments';
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
import type { WebpackMain } from '@teambit/webpack';
import { WebpackAspect } from '@teambit/webpack';
import { Workspace, WorkspaceAspect } from '@teambit/workspace';
import { DevServerContext, BundlerContext } from '@teambit/bundler';
import { DependenciesPolicy } from '@teambit/dependency-resolver';
import { TsConfigSourceFile } from 'typescript';
import { ReactAspect } from './react.aspect';
import { ReactEnv } from './react.env';
import { reactSchema } from './react.graphql';

type ReactDeps = [
  EnvsMain,
  JestMain,
  TypescriptMain,
  CompilerMain,
  WebpackMain,
  Workspace,
  GraphqlMain,
  PkgMain,
  TesterMain
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

export class ReactMain {
  constructor(
    /**
     * an instance of the React env.
     */
    readonly reactEnv: ReactEnv,

    private envs: EnvsMain
  ) {}

  readonly env = this.reactEnv;

  private tsConfigOverride: TsConfigSourceFile | undefined;

  /**
   *  return aspect icon
   */
  icon() {
    return 'https://static.bit.dev/extensions-icons/react.svg';
  }

  /**
   * override the TS config of the React environment.
   */
  overrideTsConfig(tsconfig: TsConfigSourceFile) {
    this.tsConfigOverride = tsconfig;

    return this.envs.override({
      getCompiler: () => {
        return this.reactEnv.getCompiler(tsconfig);
      },
    });
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
   * @param jestConfigPath absolute path to jest.config.json.
   */
  overrideJestConfig(jestConfigPath: string) {
    return this.envs.override({
      getTester: () => this.reactEnv.getTester(jestConfigPath),
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
      getPipe: () => tasks,
    });
  }

  /**
   * override the dependency configuration of the component environment.
   */
  overrideDependencies(dependencyPolicy: DependenciesPolicy) {
    return this.envs.override({
      getDependencies: () => merge(dependencyPolicy, this.reactEnv.getDependencies()),
    });
  }

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
  ];

  static async provider(
    [envs, jest, ts, compiler, webpack, workspace, graphql, pkg, tester]: ReactDeps,
    config: ReactMainConfig
  ) {
    const reactEnv = new ReactEnv(jest, ts, compiler, webpack, workspace, pkg, tester, config);
    const react = new ReactMain(reactEnv, envs);
    graphql.register(reactSchema(react));
    envs.registerEnv(reactEnv);
    return react;
  }
}

ReactAspect.addRuntime(ReactMain);
