import { createTesting } from '@stencil/core/testing';
import { Tester, TesterContext, Tests } from '@teambit/tester';
import { Workspace } from '@teambit/workspace';

// @ts-ignore
export class StencilTester implements Tester {
  constructor(readonly id: string, private workspace: Workspace) {}

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async test(context: TesterContext): Promise<Tests> {
    const testing = await createTesting({
      rootDir: this.workspace.path,
    });

    await testing.run({});

    return {
      // @ts-ignore
      total: 50,
    };
  }
}
