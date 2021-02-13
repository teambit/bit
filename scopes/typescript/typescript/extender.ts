import { merge } from 'lodash';
import { TsConfigSourceFile } from 'typescript';
import { UseExtenderFunction } from '@teambit/envs';
import {
  ExtendedTypescriptCompilerOptions,
  TypeScriptCompilerOptions,
  emptySingleExtendedTsCompilerOptions,
  SingleExtendedTypescriptCompilerOption,
  ExtenderOptions,
  TypeScriptOptional,
} from './compiler-options';

type ExtendedTypeScriptOptions = {
  baseTypeScriptOptions: TypeScriptOptional;
  tsBuildOptions?: Partial<TypeScriptCompilerOptions>;
  overrideExistingBaseConfig: Boolean;
  overrideExistingBuildConfig: Boolean;
};

export type UseTypescriptParameters = {
  vendorConfig: TsConfigSourceFile;
  options?: ExtendedTypeScriptOptions;
  tsModule?: any;
};

/**
 * add ts compiler to the compilers array of an environment.
 * @param {UseTypescriptParameters} params object containing the following parameters:
 * @param {TsConfigSourceFile} params.vendorConfig baseTsConfig - if no build ts config is provided in the options parameter, this will be
 * used for both workspace and build Ts compilation
 * @param {ExtendedTypeScriptOptions} params.options extender options, includes options for the base ts config, full config options for
 * build Ts config (if required separately to the base config), and whether to override existing base and/or build configs
 * @param {any} params.tsModule typeof `ts` module instance. If not passed, the env will use it's in-built ts module instance.
 */
export const UseTypescript: UseExtenderFunction = ({
  vendorConfig,
  options,
  tsModule,
}: UseTypescriptParameters): ExtendedTypescriptCompilerOptions => {
  const extendedWsOptions: SingleExtendedTypescriptCompilerOption = {
    tsconfig: vendorConfig,
    ...options?.baseTypeScriptOptions,
    overrideExistingConfig: options?.overrideExistingBaseConfig,
  };

  const extendedBuildOptions: SingleExtendedTypescriptCompilerOption = options?.tsBuildOptions
    ? {
        overrideExistingConfig: options.overrideExistingBuildConfig,
        ...options.tsBuildOptions,
      }
    : extendedWsOptions;

  return {
    tsWorkspaceOptions: merge(emptySingleExtendedTsCompilerOptions, extendedWsOptions),
    tsBuildOptions: merge(emptySingleExtendedTsCompilerOptions, extendedBuildOptions),
    tsModule: tsModule,
  };
};
