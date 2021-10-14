import { VariantPolicyConfigObject } from '@teambit/dependency-resolver';
import { merge } from 'lodash';
import { TsConfigSourceFile } from 'typescript';
import type { TsCompilerOptionsWithoutTsConfig } from '@teambit/typescript';
import { MainRuntime } from '@teambit/cli';
import { GeneratorAspect, GeneratorMain } from '@teambit/generator';
import { BuildTask } from '@teambit/builder';
import { Compiler } from '@teambit/compiler';
import { PackageJsonProps } from '@teambit/pkg';
import { EnvsAspect, EnvsMain, EnvTransformer, Environment } from '@teambit/envs';
import { ReactAspect, ReactMain } from '@teambit/react';
import { NodeAspect } from './node.aspect';
import { NodeEnv } from './node.env';
import { nodeEnvTemplate } from './templates/node-env';
import { nodeTemplate } from './templates/node';

export class NodeMain {
  constructor(
    private react: ReactMain,

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
  overrideDependencies(dependencyPolicy: VariantPolicyConfigObject) {
    return this.envs.override({
      getDependencies: () => merge(dependencyPolicy, this.nodeEnv.getDependencies()),
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
  static dependencies = [EnvsAspect, ReactAspect, GeneratorAspect];

  static async provider([envs, react, generator]: [EnvsMain, ReactMain, GeneratorMain]) {
    const nodeEnv: NodeEnv = envs.merge(new NodeEnv(), react.reactEnv);
    envs.registerEnv(nodeEnv);
    generator.registerComponentTemplate([nodeEnvTemplate, nodeTemplate]);
    return new NodeMain(react, nodeEnv, envs);
  }
}

NodeAspect.addRuntime(NodeMain);
