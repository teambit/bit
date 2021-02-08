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

export type ExtenderOptions = {
  /**
   * If set, overrides any existing/default babel config
   */
  overrideExistingConfig?: Boolean;
  /**
   * by default using Babel removes the Typescript compiler. Setting this flag will
   * enable using both TS and Babel compilation on the environment
   */
  useBabelAndTypescript?: Boolean;
};

export type ExtendedBabelOptions = {
  /**
   * If provided overrides the environments' @babel/core version
   */
  module?: any;
} & Partial<BabelCompilerOptions> &
  ExtenderOptions;

export const emptyExtendedBabelOptions: ExtendedBabelOptions = {};
