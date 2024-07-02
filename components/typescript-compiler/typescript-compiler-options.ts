import { CompilerOptions as TsCompilerOptions, CustomTransformers } from 'typescript';
import type { CompilerOptions } from '@teambit/compiler';
import { TsConfigTransformer } from '@teambit/typescript';

export type TypeScriptCompilerOptions = {
  /**
   * path to tsconfig to use during compilation.
   */
  tsconfig?: string;

  /**
   * a compiler options object.
   */
  compilerOptions?: TsCompilerOptions;

  /**
   * path for .d.ts files to include during build.
   */
  types?: string[];

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

  /**
   * By default when setting the tsconfig to have
   * "moduleResolution": "NodeNext",
   * "module": "NodeNext"
   * TS will check the closest package.json to determine if it should emit ESM to CJS outputs.
   * Since in bit we don't have a package.json usually, TS will just emit CJS
   * This option will force TS to emit ESM
   */
  esm?: boolean;

  /**
   * instance of typescript to use.
   */
  typescript?: any;

  // envContext: EnvContext

  /**
   * array of tsconfig transformers to apply.
   */
  transformers?: TsConfigTransformer[];

  /**
   * array of transpilation transformers to apply.
   */
  typescriptTransformers?: CustomTransformers;
} & Partial<CompilerOptions>;

export type TsCompilerOptionsWithoutTsConfig = Omit<TypeScriptCompilerOptions, 'tsconfig'>;
