import { createTesting } from '@stencil/core/testing';
import { Tester, TesterContext, TestResults } from '../tester';
import { Workspace } from '../workspace';

export class StencilTester implements Tester {
  constructor(private workspace: Workspace) {}

  async test(context: TesterContext): Promise<TestResults> {
    const testing = await createTesting({
      rootDir: this.workspace.path,
      cwd: this.workspace.path
    });

    testing.run({});

    return {
      total: 50
    };
  }
}
