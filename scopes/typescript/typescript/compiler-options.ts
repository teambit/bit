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
   * Run the compiler for .js files. this will only affect weather to run the compiler on the files.
   * it won't change the tsconfig to support or not support js files.
   */
  compileJs?: boolean;

  /**
   * Run the compiler for .jsx files. this will only affect weather to run the compiler on the files.
   * it won't change the tsconfig to support or not support jsx files.
   */
  compileJsx?: boolean;
} & Partial<CompilerOptions>;

export type TsCompilerOptionsWithoutTsConfig = Omit<TypeScriptCompilerOptions, 'tsconfig'>;
