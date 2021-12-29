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
import { componentTemplates, workspaceTemplates } from './react-native.templates';
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
   * @deprecated use useTypescript()
   * override the TS config of the environment.
   */
  overrideTsConfig: (
    tsconfig?: TsConfigSourceFile,
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
   * @deprecated use useTypescript()
   * override the build ts config.
   */
  overrideBuildTsConfig: (
    tsconfig?: TsConfigSourceFile,
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
  useWebpack(modifiers?: UseWebpackModifiers) {
    const mergedModifiers: UseWebpackModifiers = {
      previewConfig: [previewConfigTransformer].concat(modifiers?.previewConfig ?? []),
      devServerConfig: [devServerConfigTransformer].concat(modifiers?.devServerConfig ?? []),
    };
    return this.react.useWebpack(mergedModifiers);
  }

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
      getDependencies: () => merge(dependencyPolicy, this.reactNativeEnv.getDependencies?.()),
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
    generator.registerComponentTemplate(componentTemplates);
    generator.registerWorkspaceTemplate(workspaceTemplates);
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
      '@types/react': '^17.0.8',
      '@types/react-dom': '^17.0.5',
      '@types/react-native': '^0.64.1',
    },
    peerDependencies: {
      react: '^16.8.0 || ^17.0.0',
      'react-dom': '^16.8.0 || ^17.0.0',
      'react-native': '^0.64.1',
      'react-native-web': '^0.16.0',
    },
  };
}
