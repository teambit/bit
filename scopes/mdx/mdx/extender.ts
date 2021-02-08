import { merge } from 'lodash';
import { UseExtenderFunction } from '@teambit/envs';
import { MdxCompilerOptions, ExtendedMdxOptions, ExtenderOptions, emptyExtendedMdxOptions } from './compiler-options';

export type UseMdxParameters = {
  vendorConfig: Partial<MdxCompilerOptions>;
  options: ExtenderOptions;
  module: any;
};

/**
 * add Mdx compiler to an environment.
 * @param vendorConfig: config for Mdx compiler
 * @param options Extending options, such as overrideExisting
 * @param module typeof Mdx module instance
 */
export const UseMdx: UseExtenderFunction = (params: UseMdxParameters): ExtendedMdxOptions => {
  const extendedOptions = { ...params.vendorConfig, ...params.options, ...params.module };
  return merge(emptyExtendedMdxOptions, extendedOptions);
};
