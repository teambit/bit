import { Component } from '../component';
import { Workspace } from '../workspace';

export type TestResults = {
  total: number;
};

export type TesterContext = {
  components: Component[];
  workspace: Workspace;
  verbose?: boolean;
};

export interface Tester {
  test(context: TesterContext): Promise<TestResults>;
}
