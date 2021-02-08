import { CompilerOptions } from '@teambit/compiler';

export type MdxCompilerOptions = {
  mdxConfig?: any; // TODO what's the config type for mdx?
  /**
   * list of file extensions to consider as MDX files.
   */
  extensions: string[];
  /**
   * If provided overrides the environments' mdx version
   */
  module?: any;
} & Partial<CompilerOptions>;

export type ExtenderOptions = {
  /**
   * If set, overrides any existing/default babel config
   */
  overrideExistingConfig?: Boolean;
};

export type ExtendedMdxOptions = {} & Partial<MdxCompilerOptions> & ExtenderOptions;

export const emptyExtendedMdxOptions: ExtendedMdxOptions = {
  extensions: [],
};
