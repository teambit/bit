import { VariantPolicyConfigObject } from '@teambit/dependency-resolver';
import { merge } from 'lodash';
import { TsConfigSourceFile } from 'typescript';
import type { TsCompilerOptionsWithoutTsConfig } from '@teambit/typescript';
import { BuildTask } from '@teambit/builder';
import { Compiler } from '@teambit/compiler';
import { PackageJsonProps } from '@teambit/pkg';
import { EnvsAspect, EnvsMain, EnvTransformer, Environment } from '@teambit/envs';
import { NodeAspect, NodeMain } from "@teambit/node";
import {
  previewConfigTransformer,
  devServerConfigTransformer,
} from "./webpack/webpack-transformers";
import { UseWebpackModifiers } from "@teambit/react";
import { LitEnv } from './lit.env';

const newtsConfig = require("./tsconfig.json");

export class LitEnvMain {
  constructor(
    private node: NodeMain,
    private litEnv: LitEnv,
    private envs: EnvsMain
    ) {}

  /**
   * override the TS config of the environment.
   */
  overrideTsConfig: (
    tsconfig: TsConfigSourceFile,
    compilerOptions?: Partial<TsCompilerOptionsWithoutTsConfig>,
    tsModule?: any
  ) => EnvTransformer = this.node.overrideTsConfig.bind(this.node);

  /**
   * override the jest config of the environment.
   */
  overrideJestConfig = this.node.overrideJestConfig.bind(this.node);

  /**
   * override the env build pipeline.
   */
  overrideBuildPipe: (tasks: BuildTask[]) => EnvTransformer = this.node.overrideBuildPipe.bind(this.node);

  /**
   * override the env compilers list.
   */
  overrideCompiler: (compiler: Compiler) => EnvTransformer = this.node.overrideCompiler.bind(this.node);

  /**
   * override the env compilers tasks in the build pipe.
   */
  overrideCompilerTasks: (tasks: BuildTask[]) => EnvTransformer = this.node.overrideCompilerTasks.bind(this.node);

  /**
   * override the build ts config.
   */
  overrideBuildTsConfig: (
    tsconfig: any,
    compilerOptions?: Partial<TsCompilerOptionsWithoutTsConfig>
  ) => EnvTransformer = this.node.overrideBuildTsConfig.bind(this.node);

  /**
   * override package json properties.
   */
  overridePackageJsonProps: (props: PackageJsonProps) => EnvTransformer = this.node.overridePackageJsonProps.bind(
    this.node
  );

  /**
   * @deprecated - use useWebpack
   * override the preview config in the env.
   */
  overridePreviewConfig = this.node.overridePreviewConfig.bind(this.node);

  /**
   * @deprecated - use useWebpack
   * override the dev server configuration.
   */
  overrideDevServerConfig = this.node.overrideDevServerConfig.bind(this.node);

  /**
   * override the env's dev server and preview webpack configurations.
   * Replaces both overrideDevServerConfig and overridePreviewConfig
   */
  useWebpack = this.node.useWebpack.bind(this.node);

  /**
   * override the dependency configuration of the component environment.
   */
  overrideDependencies(dependencyPolicy: VariantPolicyConfigObject) {
    return this.envs.override({
      getDependencies: () => merge(dependencyPolicy, this.litEnv.getDependencies()),
    });
  }

  overrideMounter = this.node.overrideMounter.bind(this.node);

  /**
   * create a new composition of the node environment.
   */
  compose(transformers: EnvTransformer[], targetEnv: Environment = {}) {
    return this.envs.compose(this.envs.merge(targetEnv, this.litEnv), transformers);
  }

  static dependencies: any = [EnvsAspect, NodeAspect];

  static async provider([envs, node]: [EnvsMain, NodeMain]) {
    const litEnv: LitEnv = envs.merge(new LitEnv(), node.nodeEnv);

    const webpackModifiers: UseWebpackModifiers = {
      previewConfig: [previewConfigTransformer],
      devServerConfig: [devServerConfigTransformer],
    };
    const LitEnvEnv = node.compose([
      node.overrideTsConfig(newtsConfig),
      node.overrideBuildTsConfig(newtsConfig),
      node.useWebpack(webpackModifiers)
    ]);

    envs.registerEnv(LitEnvEnv);

    return new LitEnvMain(node, litEnv, envs);
  }
}
