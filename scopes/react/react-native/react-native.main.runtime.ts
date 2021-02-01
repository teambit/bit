import { Configuration } from 'webpack';
import { merge as webpackMerge } from 'webpack-merge';
import { VariantPolicyConfigObject } from '@teambit/dependency-resolver';
import { merge } from 'lodash';
import { MainRuntime } from '@teambit/cli';
import { BuildTask } from '@teambit/builder';
import { Aspect } from '@teambit/harmony';
import { PackageJsonProps } from '@teambit/pkg';
import { EnvsAspect, EnvsMain, EnvTransformer, Environment } from '@teambit/envs';
import { ReactAspect, ReactMain } from '@teambit/react';
import { ReactNativeAspect } from './react-native.aspect';

const webpackConfig = require('./webpack/webpack.config');

const jestConfig = require.resolve('./jest/jest.config');

export class ReactNativeMain {
  constructor(
    private react: ReactMain,

    readonly reactNativeEnv: Environment,

    private envs: EnvsMain
  ) {}

  icon() {
    return 'https://static.bit.dev/extensions-icons/react.svg';
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
  overrideBuildPipe: (tasks: BuildTask[]) => EnvTransformer = this.react.overrideBuildPipe.bind(this.react);

  /**
   * override the build ts config.
   */
  overrideBuildTsConfig = this.react.overrideBuildTsConfig.bind(this.react);

  /**
   * override package json properties.
   */
  overridePackageJsonProps: (props: PackageJsonProps) => EnvTransformer = this.react.overridePackageJsonProps.bind(
    this.react
  );

  /**
   * override the preview config in the env.
   */
  overridePreviewConfig(config: Configuration) {
    const mergedConfig = config ? webpackMerge(config as any, webpackConfig as any) : webpackConfig;
    return this.react.overridePreviewConfig(mergedConfig);
  }

  /**
   * override the dev server configuration.
   */
  overrideDevServerConfig(config: Configuration) {
    const mergedConfig = config ? webpackMerge(config as any, webpackConfig as any) : webpackConfig;
    return this.react.overrideDevServerConfig(mergedConfig);
  }

  /**
   * override the dependency configuration of the component environment.
   */
  overrideDependencies(dependencyPolicy: VariantPolicyConfigObject) {
    return this.envs.override({
      getDependencies: () => merge(dependencyPolicy, this.reactNativeEnv.getDependencies()),
    });
  }

  /**
   * create a new composition of the node environment.
   */
  compose(transformers: EnvTransformer[], targetEnv: Environment = {}) {
    return this.envs.compose(this.envs.merge(targetEnv, this.reactNativeEnv), transformers);
  }

  static dependencies: Aspect[] = [ReactAspect, EnvsAspect];
  static runtime = MainRuntime;
  static async provider([react, envs]: [ReactMain, EnvsMain]) {
    const reactNativeEnv = react.compose([
      react.overrideDevServerConfig(webpackConfig),
      react.overridePreviewConfig(webpackConfig),
      react.overrideJestConfig(jestConfig),
      react.overrideDependencies(getReactNativeDeps()),
    ]);
    envs.registerEnv(reactNativeEnv);
    return new ReactNativeMain(react, reactNativeEnv, envs);
  }
}

ReactNativeAspect.addRuntime(ReactNativeMain);

function getReactNativeDeps() {
  return {
    dependencies: {
      react: '-',
      'react-native': '-',
    },
    devDependencies: {
      '@types/react-native': '^0.63.2',
      '@types/jest': '~26.0.9',
      react: '-',
      'react-native': '-',
      'react-native-web': '0.14.8',
    },
    peerDependencies: {
      react: '^16.13.1',
      'react-native': '^0.63.3',
    },
  };
}
