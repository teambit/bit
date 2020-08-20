import { ReactAspect } from './react.aspect';
import { MainRuntime } from '@teambit/cli';
import { Environment, EnvsAspect, EnvsMain } from '@teambit/environments';
import { ReactEnv } from './react.env';
import { JestAspect } from '@teambit/jest';
import { TypescriptAspect } from '@teambit/typescript';
import { CompilerAspect } from '@teambit/compiler';
import { WebpackAspect } from '@teambit/webpack';
import type { JestMain } from '@teambit/jest';
import type { TypescriptMain } from '@teambit/typescript';
import type { CompilerMain } from '@teambit/compiler';
import type { WebpackMain } from '@teambit/webpack';
import { Component } from '@teambit/component';
import { WorkspaceAspect, Workspace } from '@teambit/workspace';
import { reactSchema } from './react.graphql';
import { GraphqlAspect } from '@teambit/graphql';
import { PkgAspect } from '@teambit/pkg';
import { TesterAspect } from '@teambit/tester';
import type { GraphqlMain } from '@teambit/graphql';
import type { PkgMain } from '@teambit/pkg';
import type { TesterMain } from '@teambit/tester';

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
