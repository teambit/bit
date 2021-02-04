import { merge } from 'lodash';

import { ExtendedTypescriptCompilerOptions, emptyExtendedTsCompilerOptions } from './typescript/types';
import { ExtendedBabelOptions, emptyExtendedBabelOptions } from './babel/types';
import { ExtendedMdxOptions } from './mdx/types';
import { ReactEnvState } from './state';

/**
 * add ts compiler to the compilers array of the React environment.
 * @param tsWorkspaceOptions ts options for workspace compilation. TsConfig is part of the options object.
 * @param tsBuildOptions ts options for build compilation, same format as workspace. If no build options are provided, the workspace options will be
 * applied for the build compilation.
 * @param tsModule typeof `ts` module instance. If not passed, the env will use it's in-built ts module instance.
 */
export function useTypescript(
  tsWorkspaceOptions: Partial<ExtendedTypescriptCompilerOptions>,
  tsBuildOptions?: Partial<ExtendedTypescriptCompilerOptions>,
  tsModule?: any
): Partial<ReactEnvState> {
  const buildOptions = tsBuildOptions || tsWorkspaceOptions;
  return {
    compiler: {
      typeScriptConfigs: {
        tsWorkspaceOptions: merge(emptyExtendedTsCompilerOptions, tsWorkspaceOptions),
        tsBuildOptions: merge(emptyExtendedTsCompilerOptions, buildOptions),
        tsModule,
      },
    },
  };
}

/**
 * add babel compiler to your React environment.
 * @param options babel compiler options. Includes babelCompilerOptions as well as user-determined flags
 * @param babelModule typeof @babel/core module instance - import * as babelModule from '@babel/core'
 */
export function useBabel(options: Partial<ExtendedBabelOptions>, babelModule?: any): Partial<ReactEnvState> {
  return {
    compiler: {
      babelConfigs: {
        babelOptions: merge(options, emptyExtendedBabelOptions),
        babelModule,
      },
    },
  };
}

export function useMdx(options: ExtendedMdxOptions): Partial<ReactEnvState> {
  return {
    compiler: {
      mdxConfigs: {
        mdxOptions: options,
      },
    },
  };
}
