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
