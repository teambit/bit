import { VariantPolicyConfigObject } from '@teambit/dependency-resolver';
import { merge } from 'lodash';
import { MainRuntime } from '@teambit/cli';
import { EnvsAspect, EnvsMain, EnvTransformer, Environment } from '@teambit/envs';
import { ReactAspect, ReactMain } from '@teambit/react';
import { NodeAspect } from './node.aspect';
import { NodeEnv } from './node.env';

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
   * override the TS config of the environment.
   */
  overrideTsConfig = this.react.overrideTsConfig.bind(this.react);

  /**
   * override the jest config of the environment.
   */
  overrideJestConfig = this.react.overrideJestConfig.bind(this.react);

  /**
   * override the env build pipeline.
   */
  overrideBuildPipe = this.react.overrideBuildPipe.bind(this.react);

  /**
   * override the build ts config.
   */
  overrideBuildTsConfig = this.react.overrideBuildTsConfig.bind(this.react);

  /**
   * override package json properties.
   */
  overridePackageJsonProps = this.react.overridePackageJsonProps.bind(this.react);

  /**
   * override the preview config in the env.
   */
  overridePreviewConfig = this.react.overridePreviewConfig.bind(this.react);

  /**
   * override the dev server configuration.
   */
  overrideDevServerConfig = this.react.overrideDevServerConfig.bind(this.react);

  /**
   * override the dependency configuration of the component environment.
   */
  overrideDependencies(dependencyPolicy: VariantPolicyConfigObject) {
    return this.envs.override({
      getDependencies: () => merge(dependencyPolicy, this.nodeEnv.getDependencies()),
    });
  }

  /**
   * create a new composition of the node environment.
   */
  compose(transformers: EnvTransformer[], targetEnv: Environment = {}) {
    return this.envs.compose(this.envs.merge(targetEnv, this.nodeEnv), transformers);
  }

  static runtime = MainRuntime;
  static dependencies = [EnvsAspect, ReactAspect];

  static async provider([envs, react]: [EnvsMain, ReactMain]) {
    const nodeEnv: NodeEnv = envs.merge(new NodeEnv(), react.reactEnv);
    envs.registerEnv(nodeEnv);
    return new NodeMain(react, nodeEnv, envs);
  }
}

NodeAspect.addRuntime(NodeMain);
