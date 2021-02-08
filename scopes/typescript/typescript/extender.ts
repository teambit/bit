import { merge } from 'lodash';
import { UseExtenderFunction } from '@teambit/envs';
import {
  ExtendedTypescriptCompilerOptions,
  TypeScriptCompilerOptions,
  emptySingleExtendedTsCompilerOptions,
  SingleExtendedTypescriptCompilerOption,
  ExtenderOptions,
} from './compiler-options';

type TypeScriptCompilersOptionsParameter = {
  tsWorkspaceOptions: Partial<TypeScriptCompilerOptions>;
  tsBuildOptions?: Partial<TypeScriptCompilerOptions>;
};

type TypsecriptExtendOptionsParameter = {
  tsExtenderOptions: ExtenderOptions;
  buildExtenderOptions: ExtenderOptions;
};

export type UseTypescriptParameters = {
  vendorConfigs: TypeScriptCompilersOptionsParameter;
  options: TypsecriptExtendOptionsParameter;
  tsModule?: any;
};

/**
 * add ts compiler to the compilers array of an environment.
 * @param {UseTypescriptParameters} params object containing the following parameters:
 * @param {TypeScriptCompilersOptionsParameter} params.vendorConfigs ts options for workspace and build compilation, flat object. TsConfig is part of the options object.
 * note: if no build options are supplied workspace options will be applied during the build compilation
 * @param {TypsecriptExtendOptionsParameter} params.options extender options, such as overrideExisting
 * @param {any} params.tsModule typeof `ts` module instance. If not passed, the env will use it's in-built ts module instance.
 */
export const UseTypescript: UseExtenderFunction = ({
  params,
}: {
  params: UseTypescriptParameters;
}): ExtendedTypescriptCompilerOptions => {
  const extendedWsOptions: SingleExtendedTypescriptCompilerOption = {
    ...params.vendorConfigs.tsWorkspaceOptions,
    ...params.options.tsExtenderOptions.overrideExistingConfig,
  };

  const extendedBuildOptions: SingleExtendedTypescriptCompilerOption = params.vendorConfigs.tsBuildOptions
    ? {
        ...params.vendorConfigs.tsBuildOptions,
        ...params.options.buildExtenderOptions.overrideExistingConfig,
      }
    : extendedWsOptions;

  return {
    tsWorkspaceOptions: merge(emptySingleExtendedTsCompilerOptions, extendedWsOptions),
    tsBuildOptions: merge(emptySingleExtendedTsCompilerOptions, extendedBuildOptions),
    tsModule: params.tsModule,
  };
};
