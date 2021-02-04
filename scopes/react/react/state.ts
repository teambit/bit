import { ExtendedBabelOptions, emptyExtendedBabelOptions } from './babel/types';
import { ExtendedTypescriptCompilerOptions, emptyExtendedTsCompilerOptions } from './typescript/types';
import { ExtendedMdxOptions, emptyExtendedMdxOption } from './mdx/types';

export type TypescriptCompilerConfigs = {
  tsWorkspaceOptions: ExtendedTypescriptCompilerOptions;
  tsBuildOptions: ExtendedTypescriptCompilerOptions;
  /**
   * User defined ts module, to set the ts version used by the environment
   */
  tsModule: any;
};

export const emptyTypescriptCompilerConfigs: TypescriptCompilerConfigs = {
  tsWorkspaceOptions: emptyExtendedTsCompilerOptions,
  tsBuildOptions: emptyExtendedTsCompilerOptions,
  tsModule: undefined,
};

export type BabelCompilerConfigs = {
  babelOptions: ExtendedBabelOptions;
  /**
   * User defined @babel/core module, to set the @babel/core version used by the environment
   */
  babelModule: any;
};

export const emptyBabelCompilerConfigs: BabelCompilerConfigs = {
  babelOptions: emptyExtendedBabelOptions,
  babelModule: undefined,
};

export type MdxCompilerConfigs = {
  mdxOptions: ExtendedMdxOptions;
};

export const emptyMdxCompilerConfigs: MdxCompilerConfigs = {
  mdxOptions: emptyExtendedMdxOption,
};

export type CompilerState = {
  /**
   * Various compiler configs
   */
  typeScriptConfigs?: TypescriptCompilerConfigs;
  babelConfigs?: BabelCompilerConfigs;
  mdxConfigs?: MdxCompilerConfigs;
};

export type TesterState = {};

export type ReactEnvState = {
  /**
   * configs used by environment
   */
  compiler: CompilerState;
  // tester: TesterState
};

export const emptyState: ReactEnvState = {
  compiler: {
    typeScriptConfigs: emptyTypescriptCompilerConfigs,
    babelConfigs: emptyBabelCompilerConfigs,
  },
};
