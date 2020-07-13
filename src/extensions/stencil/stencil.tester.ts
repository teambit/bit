import { createTesting } from '@stencil/core/testing';
import { Tester, TestResults } from '../tester';
import { Workspace } from '../workspace';

export class StencilTester implements Tester {
  constructor(private workspace: Workspace) {}

  async test(): Promise<TestResults> {
    const testing = await createTesting({
      rootDir: this.workspace.path
      // cwd: this.workspace.path
    });

    testing.run({});

    return {
      total: 50
    };
  }
}
