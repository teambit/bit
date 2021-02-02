import { TsConfigSourceFile } from 'typescript';
import { EnvsMain, EnvsAspect, EnvTransformer } from '@teambit/envs';
import { ReactAspect, ReactMain } from '@teambit/react';
import { TsConfigs } from './typescript/interfaces';

const jest = require('jest');
const tsconfig = require('./typescript/tsconfig.json') as TsConfigSourceFile;
// const webpackConfig = require('./webpack/webpack.config');

export class HarmonyReactExtender {
  constructor(private react: ReactMain) {}

  protected static getUsages = (react: ReactMain): EnvTransformer[] => {
    return [...react.useTypescript({ workspaceConfig: tsconfig }, {})];
  };

  static dependencies: any = [EnvsAspect, ReactAspect];

  static async provider([envs, react]: [EnvsMain, ReactMain]) {
    const usages = this.getUsages(react);
    const harmonyReactEnv = react.compose([...usages]);

    envs.registerEnv(harmonyReactEnv);
    return new HarmonyReactExtender(react);
  }
}
