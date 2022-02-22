import type { TransformOptions } from '@babel/core';
import { CompilerOptions } from '@teambit/compiler';

export type BabelCompilerOptions = {
  /**
   * TransformOptions of Babel. @see https://babeljs.io/docs/en/options
   *
   * `babel.config.json` and `.babelrc.json` use the same options, so you can require the json file
   * and pass it as the option parameter. e.g.
   * ```
   * createCompiler({ babelTransformOptions: require('./babel.config.json') });
   * ```
   */
  babelTransformOptions?: TransformOptions;

  /**
   * Determines which files should be compiled by the Babel compiler.
   * It only works with the file types supported by Babel (.ts, .tsx, .js, .jsx, .d.ts).
   * See https://github.com/mrmlnc/fast-glob for the supported glob patters syntax.
   */
  supportedFilesGlobPatterns?: string[];
} & Partial<CompilerOptions>;
