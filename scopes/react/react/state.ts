import { ExtendedBabelOptions } from './babel/types';
import { ExtendedTypescriptCompilerOptions } from './typescript/types';
import { UseMdxOptions } from './mdx/types';

export type TypescriptCompilerConfigs = {
  tsWorkspaceOptions: ExtendedTypescriptCompilerOptions;
  tsBuildOptions: ExtendedTypescriptCompilerOptions;
  /**
   * User defined ts module, to set the ts version used by the environment
   */
  tsModule?: any;
};

export type BabelCompilerConfigs = {
  babelOptions?: ExtendedBabelOptions;
  /**
   * User defined @babel/core module, to set the @babel/core version used by the environment
   */
  babelModule?: any;
};

export type MdxCompilerConfigs = {
  mdxOptions?: UseMdxOptions;
};

export type CompilerConfigs = {
  typeScriptConfigs?: TypescriptCompilerConfigs;
  babelConfigs?: BabelCompilerConfigs;
  mdxConfigs?: MdxCompilerConfigs;
};

export type CompilerState = {
  /**
   * Various compiler configs
   */
  configs: CompilerConfigs;

  babelModule?: any;
};

export type TesterState = {};

export type ReactEnvState = {
  /**
   * configs used by environment
   */
  compiler: CompilerState;
  // tester: TesterState
};
