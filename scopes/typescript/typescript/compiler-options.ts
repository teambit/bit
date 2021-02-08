import { CompilerOptions } from '@teambit/compiler/types';
import { TsConfigSourceFile } from 'typescript';

export type TypeScriptCompilerOptions = {
  /**
   * tsconfig to use during compilation.
   */
  tsconfig: TsConfigSourceFile;

  /**
   * path for .d.ts files to include during build.
   */
  types: string[];
} & Partial<CompilerOptions>;

export type ExtenderOptions = {
  /**
   * If set, overrides existing typescript config
   */
  overrideExistingConfig?: Boolean;
};

export type SingleExtendedTypescriptCompilerOption = {} & Partial<TypeScriptCompilerOptions> & ExtenderOptions;

export type ExtendedTypescriptCompilerOptions = {
  tsWorkspaceOptions: SingleExtendedTypescriptCompilerOption;
  tsBuildOptions: SingleExtendedTypescriptCompilerOption;
  tsModule: any;
};

export const emptySingleExtendedTsCompilerOptions: SingleExtendedTypescriptCompilerOption = {
  overrideExistingConfig: undefined,
  tsconfig: undefined,
  types: undefined,
};

export const emptyExtendedTsCompilerOptions: ExtendedTypescriptCompilerOptions = {
  tsWorkspaceOptions: emptySingleExtendedTsCompilerOptions,
  tsBuildOptions: emptySingleExtendedTsCompilerOptions,
  tsModule: undefined,
};
