import { ReactAspect } from './react.aspect';
import { MainRuntime } from '../cli';
import { Environment, EnvsAspect, EnvsMain } from '../environments';
import { ReactEnv } from './react.env';
import { JestAspect } from '../jest';
import { TypescriptAspect } from '../typescript';
import { CompilerAspect } from '../compiler';
import { WebpackAspect } from '../webpack';
import type { JestMain } from '../jest';
import type { TypescriptMain } from '../typescript';
import type { CompilerMain } from '../compiler';
import type { WebpackMain } from '../webpack';
import { Component } from '../component';
import { WorkspaceAspect, Workspace } from '../workspace';
import { reactSchema } from './react.graphql';
import { GraphqlAspect } from '../graphql';
import { PkgAspect } from '../pkg';
import { TesterAspect } from '../tester';
import type { GraphqlMain } from '../graphql';
import type { PkgMain } from '../pkg';
import type { TesterMain } from '../tester';

type ReactDeps = [
  EnvsMain,
  JestMain,
  TypescriptMain,
  CompilerMain,
  WebpackMain,
  Workspace,
  GraphqlMain,
  PkgMain,
  TesterMain
];

export type ReactMainConfig = {
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

export class ReactMain {
  constructor(
    /**
     * an instance of the React env.
     */
    readonly reactEnv: ReactEnv
  ) {}

  /**
   *  return extiontion icon
   */

  icon() {
    return 'https://static.bit.dev/extensions-icons/react.svg';
  }

  /**
   * override the TS config of the extension.
   */
  overrideTsConfig(tsconfig: any, env: Environment = {}) {
    env.getCompiler = () => this.reactEnv.getCompiler(tsconfig);
    return env;
  }

  /**
   * override the jest configuration.
   */
  overrideJestConfig() {}

  /**
   * returns doc adjusted specifically for react components.
   */
  getDocs(component: Component) {
    const docsArray = component.state._consumer.docs;
    if (!docsArray || !docsArray[0]) {
      return null;
    }

    const docs = docsArray[0];

    return {
      abstract: docs.description,
      filePath: docs.filePath,
      properties: docs.properties,
    };
  }

  static runtime = MainRuntime;
  static dependencies = [
    EnvsAspect,
    JestAspect,
    TypescriptAspect,
    CompilerAspect,
    WebpackAspect,
    WorkspaceAspect,
    GraphqlAspect,
    PkgAspect,
    TesterAspect,
  ];

  static async provider(
    [envs, jest, ts, compiler, webpack, workspace, graphql, pkg, tester]: ReactDeps,
    config: ReactMainConfig
  ) {
    const reactEnv = new ReactEnv(jest, ts, compiler, webpack, workspace, pkg, tester, config);
    const react = new ReactMain(reactEnv);
    graphql.register(reactSchema(react));
    envs.registerEnv(reactEnv);
    return react;
  }
}

ReactAspect.addRuntime(ReactMain);
