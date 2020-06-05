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
}

export interface Tester {
  test(context: TesterContext): Promise<TestResults>;
}
