import { join } from 'path';
import { BuildContext } from '../builder';
import { BuildTask, BuildResults } from '../builder';
import { Tester } from './tester';
import { CACHE_ROOT } from '../../constants';
import { detectTestFiles } from './utils';

// move else where!!!
const CAPSULES_BASE_DIR = join(CACHE_ROOT, 'capsules');

/**
 * tester build task. Allows to test components during component build.
 */
export class TesterTask implements BuildTask {
  constructor(readonly extensionId: string) {}

  async execute(context: BuildContext): Promise<BuildResults> {
    const tester: Tester = context.env.getTester();
    const components = detectTestFiles(context.components);

    const testMatch = components.reduce((acc: string[], component: any) => {
      const specs = component.specs.map(specFile => {
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
      rootPath: CAPSULES_BASE_DIR
    });

    // @todo: Ran to fix.
    // @ts-ignore
    return tester.test(testerContext);
  }
}
