import { BuildContext, BuildResults, BuildTask } from '@teambit/builder';
import { join } from 'path';

import { Tester } from './tester';
import { detectTestFiles } from './utils';

/**
 * tester build task. Allows to test components during component build.
 */
export class TesterTask implements BuildTask {
  readonly description = 'test components';
  constructor(readonly extensionId: string) {}

  async execute(context: BuildContext): Promise<BuildResults> {
    const tester: Tester = context.env.getTester();
    const components = detectTestFiles(context.components);

    const testMatch = components.reduce((acc: string[], component: any) => {
      const specs = component.specs.map((specFile) => {
        const capsule = context.capsuleGraph.capsules.getCapsule(component.id);
        if (!capsule) throw new Error('capsule not found');
        return join(capsule.wrkDir, specFile);
      });

      acc = acc.concat(specs);
      return acc;
    }, []);

    const testerContext = Object.assign(context, {
      release: true,
      specFiles: testMatch,
      rootPath: context.capsuleGraph.capsulesRootDir,
    });

    // @todo: @guy to fix. handle components without tests, define tests results and implement from jest.
    // @ts-ignore
    return tester.test(testerContext);
  }
}
