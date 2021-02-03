import { BabelCompilerOptions } from '@teambit/babel';

export type ExtendedBabelOptions = {
  /**
   * If set, overrides existing typescript config
   */
  overrideExistingConfig?: Boolean;
  useBabelAndTypescript?: Boolean;
  compilerOptions?: BabelCompilerOptions;
};
