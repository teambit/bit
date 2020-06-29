import { Environments } from '../environments';
import { ReactEnv } from './react.env';
import { JestExtension } from '../jest';
import { TypescriptExtension } from '../typescript';
import { Compile, CompileExt } from '../compiler';
import { WebpackExtension } from '../webpack';
import { WorkspaceExt, Workspace } from '../workspace';

type ReactDeps = [Environments, JestExtension, TypescriptExtension, Compile, WebpackExtension, Workspace];

export type ReactConfig = {
  /**
   * configure the react env compiler.
   * can be configured to either TypeScript ('ts') or Babel ('babel').
   */
  compiler: 'babel' | 'ts';

  /**
   * configure the component tester.
   * can be either Jest ('jest') or Mocha ('mocha')
   */
  tester: 'jest' | 'mocha';

  /**
   * version of React to configure.
   */
  reactVersion: string;
};

export class React {
  static id = '@teambit/react';

  constructor(
    /**
     * an instance of the React env.
     */
    private reactEnv: ReactEnv
  ) {}

  /**
   * override the TS config of the extension.
   */
  overrideTsConfig() {}

  /**
   * override the jest configuration.
   */
  overrideJestConfig() {}

  static dependencies = [Environments, JestExtension, TypescriptExtension, CompileExt, WebpackExtension, WorkspaceExt];

  static provider([envs, jest, ts, compile, webpack, workspace]: ReactDeps) {
    const reactEnv = new ReactEnv(jest, ts, compile, webpack, workspace);
    envs.registerEnv(reactEnv);
    return new React(reactEnv);
  }
}
