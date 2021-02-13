import { merge } from 'lodash';
import type { TransformOptions } from '@babel/core';
import { UseExtenderFunction } from '@teambit/envs';
import { ExtenderOptions, ExtendedBabelOptions, emptyExtendedBabelOptions } from './compiler-options';

export type UseBabelParameters = {
  vendorConfig: TransformOptions;
  options?: ExtenderOptions;
  babelModule?: any;
};

/**
 * add babel compiler to an  environment.
 * @param vendorConfig babelTransformOptions
 * @param options babel compiler options. Includes babelCompilerOptions as well as user-determined flags
 * @param babelModule typeof @babel/core module instance - import * as babelModule from '@babel/core'
 */
export const UseBabel = ({ vendorConfig, options, babelModule }: UseBabelParameters): ExtendedBabelOptions => {
  const extendedOptions = { babelTransformOptions: vendorConfig, ...options, babelModule } as ExtendedBabelOptions;
  return merge(emptyExtendedBabelOptions, extendedOptions);
};
