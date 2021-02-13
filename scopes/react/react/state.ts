import ts from 'typescript';
import { BabelCompilerOptions } from '@teambit/babel';
import { TypeScriptCompilerOptions } from '@teambit/typescript';
import { MdxCompilerOptions } from '@teambit/mdx';

const defaultWsTsConfig = require('./typescript/tsconfig.json');
const defaultBuildTsConfig = require('./typescript/tsconfig.build.json');
const defaultTypes = ['./typescript/style.d.ts', './typescript/asset.d.ts'];

export const defaultReactState: ReactEnvState = {
  compiler: {
    tsConfigs: {
      typeScriptWsConfigs: { tsconfig: defaultWsTsConfig, types: defaultTypes },
      typeScriptBuildConfigs: { tsconfig: defaultBuildTsConfig, types: defaultTypes },
      tsModule: ts,
    },
  },
};

export type TsCompilerStateOptions = {
  typeScriptWsConfigs?: TypeScriptCompilerOptions;
  typeScriptBuildConfigs?: TypeScriptCompilerOptions;
  tsModule?: any;
};

export type CompilerState = {
  /**
   * Various compiler configs
   */
  tsConfigs?: TsCompilerStateOptions;
  babelConfigs?: BabelCompilerOptions;
  mdxConfigs?: MdxCompilerOptions;
};

export type TesterState = {};

export type ReactEnvState = {
  /**
   * configs used by environment
   */
  compiler: CompilerState;
  // tester: TesterState
};

export const emptyState: ReactEnvState = {
  compiler: {
    tsConfigs: {
      typeScriptWsConfigs: undefined,
      typeScriptBuildConfigs: undefined,
      tsModule: undefined,
    },
    babelConfigs: undefined,
    mdxConfigs: undefined,
  },
};
