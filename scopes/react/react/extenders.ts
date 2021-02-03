import { ExtendedTypescriptCompilerOptions } from './typescript/types';
import { ExtendedBabelOptions } from './babel/types';
import { UseMdxOptions } from './mdx/types';
import { ReactEnvState } from './state';

/**
 * add ts compiler to the compilers array of the React environment.
 * @param tsWorkspaceOptions ts options for workspace compilation. TsConfig is part of the options object.
 * @param tsBuildOptions ts options for build compilation. TsConfig is part of the options object.
 * @param tsModule typeof `ts` module instance. If not passed, the env will use it's in-built module instance.
 */
export function useTypescript(
  tsWorkspaceOptions: ExtendedTypescriptCompilerOptions,
  tsBuildOptions?: ExtendedTypescriptCompilerOptions,
  tsModule?: any
): Partial<ReactEnvState> {
  const buildOptions = tsBuildOptions || tsWorkspaceOptions;
  return {
    compiler: {
      configs: {
        typeScriptConfigs: {
          tsWorkspaceOptions: tsWorkspaceOptions,
          tsBuildOptions: buildOptions,
          tsModule,
        },
      },
    },
  };
}

/**
 * add babel compiler to your React environment.
 * @param babelCompilerOptions babel compiler options. Includes babelCompilerOptions as well as user-determined flags
 * @param babelModule typeof @babel/core module instance - import * as babelModule from '@babel/core'
 */
export function useBabel(babelCompilerOptions: ExtendedBabelOptions, babelModule?: any): Partial<ReactEnvState> {
  return {
    compiler: {
      configs: {
        typeScriptConfigs: undefined,
        babelConfigs: {
          babelOptions: babelCompilerOptions,
        },
      },
    },
  };
}

export function useMdx(mdxCompileOptions: UseMdxOptions): Partial<ReactEnvState> {
  return {
    compiler: {
      configs: {
        mdxConfigs: {
          mdxOptions: mdxCompileOptions,
        },
      },
    },
  };
}
