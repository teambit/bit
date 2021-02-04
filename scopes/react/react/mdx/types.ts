import { MDXCompilerOpts } from '@teambit/mdx';

export type ExtendedMdxOptions = {
  /**
   * If set, overrides existing typescript config
   */
  overrideExistingConfig?: Boolean;
  compilerOptions: MDXCompilerOpts;
};

export const emptyExtendedMdxOption = {
  compilerOptions: {},
};
