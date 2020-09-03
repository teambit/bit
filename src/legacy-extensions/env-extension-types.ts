import { PathOsBased } from '../utils/path';
import { BaseExtensionModel, BaseExtensionOptions, BaseExtensionProps, BaseLoadArgsProps } from './base-extension';

/**
 * Those types were extracted to dedicated file in order to prevent circular dependency between ./env-factory and ./env-extension
 * This circular dependency make problems with ncc on windows
 */

// Couldn't find a good way to do this with consts
// see https://github.com/facebook/flow/issues/627
// I would expect something like:
// type EnvType = CompilerEnvType | TesterEnvType would work
export type EnvType = 'compiler' | 'tester';

type EnvExtensionExtraProps = {
  envType: EnvType;
  dynamicPackageDependencies?: Record<string, any> | undefined;
};

export type EnvExtensionOptions = BaseExtensionOptions;

export type EnvLoadArgsProps = BaseLoadArgsProps &
  EnvExtensionExtraProps & {
    bitJsonPath: PathOsBased;
  };

export type EnvExtensionProps = BaseExtensionProps & EnvExtensionExtraProps;

export type EnvExtensionModel = BaseExtensionModel;
export type EnvExtensionSerializedModel = BaseExtensionModel;
