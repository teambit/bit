import { merge } from 'lodash';
import { UseExtenderFunction } from '@teambit/envs';
import {
  UseTypescript,
  UseTypescriptParameters,
  ExtendedTypescriptCompilerOptions,
  emptyExtendedTsCompilerOptions,
  TypeScriptCompilerOptions,
} from '@teambit/typescript';
import { UseBabel, UseBabelParameters, ExtendedBabelOptions, BabelCompilerOptions } from '@teambit/babel';
import { UseMdx, UseMdxParameters, ExtendedMdxOptions, MdxCompilerOptions } from '@teambit/mdx';
import { ReactEnvState, TsCompilerStateOptions, CompilerState, defaultReactState } from './state';

type ExtendedReactEnvState = {
  compiler: {
    extendedTsCompilerConfig?: ExtendedTypescriptCompilerOptions;
    extendedBabelCompilerConfig?: ExtendedBabelOptions;
    extendedMdxCompilerConfig?: ExtendedMdxOptions;
  };
};

/**
 * Extender function for the react environment
 * All functions return the Extender object to enable chaining any Use functions you wish to use
 * At the end of the chain, always call getState() in order to return the final state that can be
 * consumed by the environment
 */
export class ReactExtender {
  state: ReactEnvState;
  stateOverride: Partial<ExtendedReactEnvState> = {};

  constructor(initialState?: ReactEnvState) {
    /**
     * Initialise initial state for react environment - overridable via input to Extender
     */
    this.state = initialState ?? defaultReactState;
  }

  updateStateOverride = (overrideStatePartial: Partial<ExtendedReactEnvState>) => {
    return merge(this.stateOverride, overrideStatePartial);
  };

  useTypescript: UseExtenderFunction = (params: UseTypescriptParameters): ReactExtender => {
    const userDefinedTypeSriptConfig = UseTypescript(params.vendorConfigs, params.options, params.tsModule); // TODO work out how to pass the params as an object!
    this.updateStateOverride(userDefinedTypeSriptConfig);
    return this;
  };

  private CanUseTs(): Boolean {
    if (!this.stateOverride.compiler?.extendedBabelCompilerConfig) return true;
    return this.stateOverride.compiler?.extendedBabelCompilerConfig.useBabelAndTypescript ?? true;
  }

  useBabel: UseExtenderFunction = (params: UseBabelParameters): ReactExtender => {
    const userDefinedBabelConfig = UseBabel(params.vendorConfig, params.options, params.module);
    this.updateStateOverride(userDefinedBabelConfig);
    return this;
  };

  useMdx: UseExtenderFunction = (params: UseMdxParameters): ReactExtender => {
    const userDefinedMdxConfig = UseMdx(params.vendorConfig, params.options, params.module);
    this.updateStateOverride(userDefinedMdxConfig);
    return this;
  };

  buildCompilerState = (): CompilerState => {
    if (!this.stateOverride.compiler) return this.state.compiler;
    const babelCompilerOptions: BabelCompilerOptions | undefined = this.buildBabelCompilerState();
    const typescriptCompilerOptions: TsCompilerStateOptions | undefined = this.buildTsCompilerState();
    const mdxCompilerOptions: MdxCompilerOptions | undefined = this.buildMdxCompilerState();
    return {
      tsConfigs: typescriptCompilerOptions,
      babelConfigs: babelCompilerOptions,
      mdxConfigs: mdxCompilerOptions,
    };
  };

  buildMdxCompilerState = (): MdxCompilerOptions | undefined => {
    const extendedConfig = this.stateOverride.compiler?.extendedMdxCompilerConfig;
    if (!extendedConfig) return undefined;
    const { overrideExistingConfig, ...mdxCompileOptions } = extendedConfig;
    const newMdxState: MdxCompilerOptions | undefined = overrideExistingConfig
      ? (mdxCompileOptions as MdxCompilerOptions)
      : merge(this.state.compiler.mdxConfigs, mdxCompileOptions as Partial<MdxCompilerOptions>);
    return newMdxState;
  };

  buildBabelCompilerState = (): BabelCompilerOptions | undefined => {
    const extendedConfig = this.stateOverride.compiler?.extendedBabelCompilerConfig;
    if (!extendedConfig) return undefined;
    const { overrideExistingConfig, ...babelCompileOptions } = extendedConfig;
    const newBabelState: BabelCompilerOptions | undefined = overrideExistingConfig
      ? (babelCompileOptions as BabelCompilerOptions)
      : merge(this.state.compiler.babelConfigs, babelCompileOptions as BabelCompilerOptions);
    return newBabelState;
  };

  buildTsCompilerState = (): TsCompilerStateOptions | undefined => {
    const extendedConfig = this.stateOverride.compiler?.extendedTsCompilerConfig;
    if (!this.CanUseTs() || !extendedConfig) return undefined;
    const { tsWorkspaceOptions, tsBuildOptions, tsModule } = extendedConfig;
    const { overrideExistingConfig: overrideWsOptions, ...wsCompilerOptions } = tsWorkspaceOptions;
    const { overrideExistingConfig: overrideBuildOptions, ...buildCompilerOptions } = tsBuildOptions;
    const newWsCompilerState: TypeScriptCompilerOptions = tsWorkspaceOptions.overrideExistingConfig
      ? (wsCompilerOptions as TypeScriptCompilerOptions)
      : merge(this.state.compiler.tsConfigs?.typeScriptWsConfigs, wsCompilerOptions as TypeScriptCompilerOptions);
    const newBuildCompilerState: TypeScriptCompilerOptions = tsBuildOptions.overrideExistingConfig
      ? (buildCompilerOptions as TypeScriptCompilerOptions)
      : merge(this.state.compiler.tsConfigs?.typeScriptBuildConfigs, buildCompilerOptions as TypeScriptCompilerOptions);

    const newTsCompilerState: TsCompilerStateOptions = {
      typeScriptWsConfigs: newWsCompilerState,
      typeScriptBuildConfigs: newBuildCompilerState,
      tsModule,
    };

    return newTsCompilerState;
  };

  private buildState(): ReactEnvState {
    // logic of creating state from overrides

    // Compiler
    return {
      compiler: this.buildCompilerState(),
    };
  }

  getState(): ReactEnvState {
    return this.buildState();
  }
}
