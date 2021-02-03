import { TsConfigSourceFile } from 'typescript';
import { TypeScriptCompilerOptions } from '@teambit/typescript';

export type ExtendedTypescriptCompilerOptions = {
  /**
   * If set, overrides existing typescript config
   */
  overrideExistingConfig?: Boolean;
  compilerOptions: TypeScriptCompilerOptions;
};

export type TsConfigs = {
  /**
   * typsecript config used for compiling components in the local workspace
   */
  workspaceConfig: TsConfigSourceFile;
  /**
   * typescript config used when compiling components during the build stage
   * When no buildConfig is provided, the workspaceConfig will be used during the
   * build stage as well
   */
  buildConfig?: TsConfigSourceFile;
};
