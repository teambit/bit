import mergeDeepLeft from 'ramda/src/mergeDeepLeft';
import { TsConfigSourceFile } from 'typescript';
import type { TsCompilerOptionsWithoutTsConfig } from '@teambit/typescript';
import { BuildTask } from '@teambit/builder';
import { Compiler } from '@teambit/compiler';
import { PackageJsonProps } from '@teambit/pkg';
import { EnvPolicyConfigObject } from '@teambit/dependency-resolver';
import { MainRuntime } from '@teambit/cli';
import { EnvsAspect, EnvsMain, EnvTransformer, Environment } from '@teambit/envs';
import { ReactAspect, ReactEnv, ReactMain } from '@teambit/react';
import { GeneratorAspect, GeneratorMain } from '@teambit/generator';
import { htmlEnvTemplate } from './templates/html-env';
import { htmlComponentTemplate, deprecatedHtmlComponentTemplate } from './templates/html-component';
import { HtmlAspect } from './html.aspect';
import { HtmlEnv } from './html.env';

export class HtmlMain {
  constructor(
    private react: ReactMain,

    readonly htmlEnv: HtmlEnv,

    private envs: EnvsMain
  ) {}
  static slots = [];
  static dependencies = [EnvsAspect, ReactAspect, GeneratorAspect];
  static runtime = MainRuntime;

  /**
   * @deprecated use useTypescript()
   * override the TS config of the environment.
   */
  overrideTsConfig: (
    tsconfig: TsConfigSourceFile,
    compilerOptions?: Partial<TsCompilerOptionsWithoutTsConfig>,
    tsModule?: any
  ) => EnvTransformer = this.react.overrideTsConfig.bind(this.react);

  /**
   * override the jest config of the environment.
   */
  overrideJestConfig = this.react.overrideJestConfig.bind(this.react);

  /**
   * override the env build pipeline.
   */
  overrideBuildPipe: (tasks: BuildTask[]) => EnvTransformer = this.react.overrideBuildPipe.bind(this.react);

  /**
   * override the env compilers list.
   */
  overrideCompiler: (compiler: Compiler) => EnvTransformer = this.react.overrideCompiler.bind(this.react);

  /**
   * override the env compilers tasks in the build pipe.
   */
  overrideCompilerTasks: (tasks: BuildTask[]) => EnvTransformer = this.react.overrideCompilerTasks.bind(this.react);

  /**
   * @deprecated use useTypescript()
   * override the build ts config.
   */
  overrideBuildTsConfig: (
    tsconfig: any,
    compilerOptions?: Partial<TsCompilerOptionsWithoutTsConfig>
  ) => EnvTransformer = this.react.overrideBuildTsConfig.bind(this.react);

  /**
   * override package json properties.
   */
  overridePackageJsonProps: (props: PackageJsonProps) => EnvTransformer = this.react.overridePackageJsonProps.bind(
    this.react
  );

  /**
   * override the env's typescript config for both dev and build time.
   * Replaces both overrideTsConfig (devConfig) and overrideBuildTsConfig (buildConfig)
   */
  useTypescript = this.react.useTypescript.bind(this.react);

  /**
   * override the env's dev server and preview webpack configurations.
   * Replaces both overrideDevServerConfig and overridePreviewConfig
   */
  useWebpack = this.react.useWebpack.bind(this.react);

  /**
   * An API to mutate the prettier config
   */
  usePrettier = this.react.usePrettier.bind(this.react);

  /**
   * An API to mutate the eslint config
   */
  useEslint = this.react.useEslint.bind(this.react);

  /**
   * override the dependency configuration of the component environment.
   */
  overrideDependencies(dependencyPolicy: EnvPolicyConfigObject) {
    return this.envs.override({
      getDependencies: () => mergeDeepLeft(dependencyPolicy, this.htmlEnv.getDependencies()),
    });
  }

  /**
   * create a new composition of the html environment.
   */
  compose(transformers: EnvTransformer[], targetEnv: Environment = {}) {
    return this.envs.compose(this.envs.merge(targetEnv, this.htmlEnv), transformers);
  }

  static async provider([envs, react, generator]: [EnvsMain, ReactMain, GeneratorMain]) {
    const htmlEnv: HtmlEnv = envs.merge<HtmlEnv, ReactEnv>(new HtmlEnv(), react.reactEnv);
    envs.registerEnv(htmlEnv);
    generator.registerComponentTemplate([htmlEnvTemplate, htmlComponentTemplate, deprecatedHtmlComponentTemplate]);
    return new HtmlMain(react, htmlEnv, envs);
  }
}

HtmlAspect.addRuntime(HtmlMain);
