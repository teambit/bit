import { TsConfigSourceFile } from 'typescript';
import { EnvsMain, EnvsAspect } from '@teambit/envs';
import { ReactAspect, ReactMain } from '@teambit/react';
import { ReactEnvState } from './state';
import { useTypescript } from './extenders';

/**
 * Example usage:
 * CompanyNameReact extends HarmonyReactExtender
 * Then override the getUsages function, to return a list of all the
 * UseXyz overrides you wish to apply to your environment
 */

// const jest = require('jest');
// const tsconfig = require('./typescript/tsconfig.json') as TsConfigSourceFile;
// const webpackConfig = require('./webpack/webpack.config');

export class HarmonyReactExtender {
  constructor(private react: ReactMain) {}

  protected static getUsages = (): Partial<ReactEnvState>[] => {
    return [
      // Example useXyz implementation
      //useTypescript({ overrideExistingConfig: true,  tsconfig})
    ];
  };

  static dependencies: any = [EnvsAspect, ReactAspect];

  static async provider([envs, react]: [EnvsMain, ReactMain]) {
    const usages = this.getUsages();
    const harmonyReactEnv = react.extend(...usages);

    envs.registerEnv(harmonyReactEnv);
    return new HarmonyReactExtender(react);
  }
}
