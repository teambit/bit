import { TsConfigSourceFile } from 'typescript';
import { TypeScriptCompilerOptions } from '@teambit/typescript';

export type ExtendedTypescriptCompilerOptions = {
  /**
   * If set, overrides existing typescript config
   */
  overrideExistingConfig?: Boolean;
} & Partial<TypeScriptCompilerOptions>;

export const emptyExtendedTsCompilerOptions: ExtendedTypescriptCompilerOptions = {
  overrideExistingConfig: undefined,
  tsconfig: undefined,
  types: undefined,
};
