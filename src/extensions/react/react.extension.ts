import { Environments } from '../environments';
import { ReactEnv } from './react.env';
import { JestExtension } from '../jest';
import { TypescriptExtension } from '../typescript';
import { Compile, CompileExt } from '../compiler';
import { WebpackExtension } from '../webpack';
import { Component } from '../component';
import { WorkspaceExt, Workspace } from '../workspace';
import { GraphQLExtension } from '../graphql';
import { reactSchema } from './react.graphql';

type ReactDeps = [
  Environments,
  JestExtension,
  TypescriptExtension,
  Compile,
  WebpackExtension,
  Workspace,
  GraphQLExtension
];

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

export class ReactExtension {
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
      properties: docs.properties
    };
  }

  static dependencies = [
    Environments,
    JestExtension,
    TypescriptExtension,
    CompileExt,
    WebpackExtension,
    WorkspaceExt,
    GraphQLExtension
  ];

  static provider([envs, jest, ts, compile, webpack, workspace, graphql]: ReactDeps) {
    const reactEnv = new ReactEnv(jest, ts, compile, webpack, workspace);
    const react = new ReactExtension(reactEnv);
    graphql.register(reactSchema(react));
    envs.registerEnv(reactEnv);
    return react;
  }
}
