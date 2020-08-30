import { Component } from '@teambit/component';
import { ConcreteService, ExecutionContext } from '@teambit/environments';
import { Workspace } from '@teambit/workspace';

export type TestResults = {
  errors?: Error[];
  total: number;
};

export interface TesterContext extends ExecutionContext {
  /**
   * list of components to test.
   */
  components: Component[];

  /**
   * component workspace.
   */
  workspace: Workspace;

  /**
   * defines whether tester is expected to run in quite mode.
   */
  quite?: boolean;

  /**
   * list of spec files to test.
   */
  specFiles: string[];

  /**
   * rootPath of the component workspace.
   */
  rootPath: string;

  /**
   * determines whether tester is expected to run in watch mode.
   */
  watch?: boolean;

  /**
   * determines whether tester is expected to run in debug mode.
   */
  debug?: boolean;
}

/**
 * tester interface allows extensions to implement a component tester into bit.
 */
export interface Tester extends ConcreteService {
  /**
   * execute tests on all components in the given execution context.
   */
  test(context: TesterContext): Promise<TestResults>;
}
