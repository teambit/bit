import type { CompilerOptions } from '@teambit/compiler';

export type TypeScriptCompilerOptions = {
  /**
   * tsconfig to use during compilation.
   */
  tsconfig: Record<string, any>;

  /**
   * path for .d.ts files to include during build.
   */
  types: string[];

  /**
   * Run the compiler for .js files. this will only affect whether to run the compiler on the files
   * or not. It won't change the tsconfig to support or not support js files.
   */
  compileJs?: boolean;

  /**
   * Run the compiler for .js files. this will only affect whether to run the compiler on the files
   * or not. It won't change the tsconfig to support or not support jsx files.
   */
  compileJsx?: boolean;
} & Partial<CompilerOptions>;

export type TsCompilerOptionsWithoutTsConfig = Omit<TypeScriptCompilerOptions, 'tsconfig'>;
