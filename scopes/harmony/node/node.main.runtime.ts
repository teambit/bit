import { Harmony } from '@teambit/harmony';
import { EnvPolicyConfigObject } from '@teambit/dependency-resolver';
import { TsConfigSourceFile } from 'typescript';
import { TsCompilerOptionsWithoutTsConfig, TypescriptAspect, TypescriptMain } from '@teambit/typescript';
import { ApplicationAspect, ApplicationMain } from '@teambit/application';
import { merge } from 'lodash';
import { LoggerAspect, LoggerMain } from '@teambit/logger';
import { MainRuntime } from '@teambit/cli';
import { GeneratorAspect, GeneratorMain } from '@teambit/generator';
import { BuildTask } from '@teambit/builder';
import { ComponentID } from '@teambit/component-id';
import { WorkerAspect, WorkerMain } from '@teambit/worker';
import { Compiler } from '@teambit/compiler';
import { PackageJsonProps } from '@teambit/pkg';
import { EnvsAspect, EnvsMain, EnvTransformer, Environment, EnvContext } from '@teambit/envs';
import { ReactAspect, ReactEnv, ReactMain, UseTypescriptModifiers } from '@teambit/react';
import { NodeAspect } from './node.aspect';
import { NodeEnv } from './node.env';
import { getTemplates } from './node.templates';
import { NodeAppType } from './node.app-type';

export class NodeMain {
  constructor(
    private react: ReactMain,

    private tsAspect: TypescriptMain,

    readonly nodeEnv: NodeEnv,

    private envs: EnvsMain
  ) {}

  icon() {
    return 'https://static.bit.dev/extensions-icons/nodejs.svg';
  }

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
   * @deprecated - use useWebpack
   * override the preview config in the env.
   */
  overridePreviewConfig = this.react.overridePreviewConfig.bind(this.react);

  /**
   * @deprecated - use useWebpack
   * override the dev server configuration.
   */
  overrideDevServerConfig = this.react.overrideDevServerConfig.bind(this.react);

  /**
   * override the env's typescript config for both dev and build time.
   * Replaces both overrideTsConfig (devConfig) and overrideBuildTsConfig (buildConfig)
   */
  useTypescript(modifiers?: UseTypescriptModifiers, tsModule?: any) {
    const overrides: any = {};
    const devTransformers = modifiers?.devConfig;
    if (devTransformers) {
      overrides.getCompiler = () => this.nodeEnv.getCompiler(devTransformers, tsModule);
    }
    const buildTransformers = modifiers?.buildConfig;
    if (buildTransformers) {
      const buildPipeModifiers = {
        tsModifier: {
          transformers: buildTransformers,
          module: tsModule,
        },
      };
      overrides.getBuildPipe = () => this.nodeEnv.getBuildPipe(buildPipeModifiers);
    }
    return this.envs.override(overrides);
  }

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
      getDependencies: () => merge(this.nodeEnv.getDependencies(), dependencyPolicy),
    });
  }

  overrideMounter = this.react.overrideMounter.bind(this.react);

  /**
   * create a new composition of the node environment.
   */
  compose(transformers: EnvTransformer[], targetEnv: Environment = {}) {
    return this.envs.compose(this.envs.merge(targetEnv, this.nodeEnv), transformers);
  }

  static runtime = MainRuntime;
  static dependencies = [
    LoggerAspect,
    EnvsAspect,
    ApplicationAspect,
    ReactAspect,
    GeneratorAspect,
    TypescriptAspect,
    WorkerAspect,
  ];

  static async provider(
    [loggerAspect, envs, application, react, generator, tsAspect, workerMain]: [
      LoggerMain,
      EnvsMain,
      ApplicationMain,
      ReactMain,
      GeneratorMain,
      TypescriptMain,
      WorkerMain,
    ],
    config,
    slots,
    harmony: Harmony
  ) {
    const logger = loggerAspect.createLogger(NodeAspect.id);
    const nodeEnv = envs.merge<NodeEnv, ReactEnv>(new NodeEnv(tsAspect, react), react.reactEnv);
    envs.registerEnv(nodeEnv);
    const nodeAppType = new NodeAppType('node-app', nodeEnv, logger);
    application.registerAppType(nodeAppType);
    if (generator) {
      const envContext = new EnvContext(ComponentID.fromString(ReactAspect.id), loggerAspect, workerMain, harmony);
      generator.registerComponentTemplate(getTemplates(envContext));
    }
    return new NodeMain(react, tsAspect, nodeEnv, envs);
  }
}

NodeAspect.addRuntime(NodeMain);
