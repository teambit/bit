import { merge } from 'lodash';
import { UseExtenderFunction } from '@teambit/envs';
import {
  BabelCompilerOptions,
  ExtenderOptions,
  ExtendedBabelOptions,
  emptyExtendedBabelOptions,
} from './compiler-options';

export type UseBabelParameters = {
  vendorConfig: Partial<BabelCompilerOptions>;
  options: ExtenderOptions;
  module: any;
};

/**
 * add babel compiler to an  environment.
 * @param vendorConfig
 * @param options babel compiler options. Includes babelCompilerOptions as well as user-determined flags
 * @param babelModule typeof @babel/core module instance - import * as babelModule from '@babel/core'
 */
export const UseBabel: UseExtenderFunction = (params: UseBabelParameters): ExtendedBabelOptions => {
  const extendedOptions = { ...params.vendorConfig, ...params.options, ...params.module };
  return merge(emptyExtendedBabelOptions, extendedOptions);
};
