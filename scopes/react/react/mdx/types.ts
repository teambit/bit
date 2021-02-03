import { MDXCompilerOpts } from '@teambit/mdx';

export type UseMdxOptions = {
  /**
   * If set, overrides existing typescript config
   */
  overrideExistingConfig?: Boolean;
  compilerOptions: MDXCompilerOpts;
};
