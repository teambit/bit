import { MainRuntime } from '@teambit/cli';
import { EnvsAspect, EnvsMain, EnvTransformer, Environment } from '@teambit/envs';
import { ReactAspect, ReactMain } from '@teambit/react';
import { ReactNativeAspect } from './react-native.aspect';
import { ReactNativeEnv } from './react-native.env';

export class ReactNativeMain {
  constructor(
    private react: ReactMain,

    readonly reactnativeEnv: ReactNativeEnv,

    private envs: EnvsMain
  ) {}

  icon() {
    return 'https://static.bit.dev/extensions-icons/react.svg';
  }

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
   * create a new composition of the node environment.
   */
  compose(transformers: EnvTransformer[], targetEnv: Environment = {}) {
    return this.envs.compose(this.envs.merge(targetEnv, this.reactnativeEnv), transformers);
  }

  static runtime = MainRuntime;
  static dependencies = [EnvsAspect, ReactAspect];

  static async provider([envs, react]: [EnvsMain, ReactMain]) {
    const reactnativeEnv: ReactNativeEnv = envs.merge(new ReactNativeEnv(), react.reactEnv);
    react.overrideDependencies(reactnativeEnv.getDependencies());
    react.overrideTsConfig(reactnativeEnv.getTsConfig());
    react.overrideDevServerConfig(reactnativeEnv.getWebpackConfig());
    envs.registerEnv(reactnativeEnv);
    return new ReactNativeMain(react, reactnativeEnv, envs);
  }
}

ReactNativeAspect.addRuntime(ReactNativeMain);
