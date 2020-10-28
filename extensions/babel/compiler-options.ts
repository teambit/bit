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
} & Partial<CompilerOptions>;
