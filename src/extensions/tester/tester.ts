import { Component } from '../component';
import { Workspace } from '../workspace';
import { ExecutionContext } from '../environments';

export type TestResults = {
  total: number;
};

export interface TesterContext extends ExecutionContext {
  components: Component[];
  workspace: Workspace;
  quite?: boolean;
  specFiles: string[];
  rootPath: string;
}

/**
 * tester interface allows extensions to implement a component tester into bit.
 */
export interface Tester {
  /**
   * execute tests on all components in the given execution context.
   */
  test(context: TesterContext): Promise<TestResults>;
}
