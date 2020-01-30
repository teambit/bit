import { ExtensionFileModel, ExtensionFileSerializedModel } from './extension-file';
import { BaseExtensionProps, BaseLoadArgsProps, BaseExtensionOptions, BaseExtensionModel } from './base-extension';
import ExtensionFile from './extension-file';
import { PathOsBased } from '../utils/path';

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
  dynamicPackageDependencies?: Record<string, any> | null | undefined;
};

export type EnvExtensionOptions = BaseExtensionOptions;

export type EnvLoadArgsProps = BaseLoadArgsProps &
  EnvExtensionExtraProps & {
    bitJsonPath: PathOsBased;
    files: string[];
  };

export type EnvExtensionProps = BaseExtensionProps & EnvExtensionExtraProps & { files: ExtensionFile[] };

export type EnvExtensionModel = BaseExtensionModel & {
  files?: ExtensionFileModel[];
};
export type EnvExtensionSerializedModel = BaseExtensionModel & {
  files?: ExtensionFileSerializedModel[];
};
