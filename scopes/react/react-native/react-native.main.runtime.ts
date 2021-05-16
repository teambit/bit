import { VariantPolicyConfigObject } from '@teambit/dependency-resolver';
import { GeneratorAspect, GeneratorMain } from '@teambit/generator';
import { TsConfigSourceFile } from 'typescript';
import type { TsCompilerOptionsWithoutTsConfig } from '@teambit/typescript';
import { merge } from 'lodash';
import { MainRuntime } from '@teambit/cli';
import { BuildTask } from '@teambit/builder';
import { Aspect } from '@teambit/harmony';
import { PackageJsonProps } from '@teambit/pkg';
import { EnvsAspect, EnvsMain, EnvTransformer, Environment } from '@teambit/envs';
import { ReactAspect, ReactMain, UseWebpackModifiers } from '@teambit/react';
import { ReactNativeAspect } from './react-native.aspect';
import { reactNativeTemplate } from './templates/react-native-env';
import { previewConfigTransformer, devServerConfigTransformer } from './webpack/webpack-transformers';

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

  useWebpack(modifiers?: UseWebpackModifiers) {
    const mergedModifiers: UseWebpackModifiers = {
      previewConfig: (modifiers?.previewConfig ?? []).concat(previewConfigTransformer),
      devServerConfig: (modifiers?.devServerConfig ?? []).concat(devServerConfigTransformer),
    };
    return this.react.useWebpack(mergedModifiers);
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

  static dependencies: Aspect[] = [ReactAspect, EnvsAspect, GeneratorAspect];
  static runtime = MainRuntime;
  static async provider([react, envs, generator]: [ReactMain, EnvsMain, GeneratorMain]) {
    const webpackModifiers: UseWebpackModifiers = {
      previewConfig: [previewConfigTransformer],
      devServerConfig: [devServerConfigTransformer],
    };
    const reactNativeEnv = react.compose([
      react.useWebpack(webpackModifiers),
      react.overrideJestConfig(jestConfig),
      react.overrideDependencies(getReactNativeDeps()),
    ]);
    envs.registerEnv(reactNativeEnv);
    generator.registerComponentTemplate([reactNativeTemplate]);
    return new ReactNativeMain(react, reactNativeEnv, envs);
  }
}

ReactNativeAspect.addRuntime(ReactNativeMain);

function getReactNativeDeps() {
  return {
    dependencies: {
      react: '-',
      'react-dom': '-',
      'react-native': '-',
    },
    devDependencies: {
      react: '-',
      'react-dom': '-',
      'react-native': '-',
      '@types/jest': '^26.0.0',
      '@types/react': '^16.8.0',
      '@types/react-dom': '^16.8.0',
      '@types/react-native': '^0.63.0',
    },
    peerDependencies: {
      react: '^16.8.0',
      'react-dom': '^16.8.0',
      'react-native': '^0.63.0',
      'react-native-web': '^0.14.0',
    },
  };
}
