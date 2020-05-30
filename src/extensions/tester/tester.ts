import { Component } from '../component';
import { Workspace } from '../workspace';
import { EnvContext } from '../environments';

export type TestResults = {
  total: number;
};

export interface TesterContext extends EnvContext {
  components: Component[];
  workspace: Workspace;
  quite?: boolean;
}

export interface Tester {
  test(context: TesterContext): Promise<TestResults>;
}
