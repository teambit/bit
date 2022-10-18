import { MainRuntime } from '@teambit/cli';
import { Tester } from '@teambit/tester';
import { MultiTesterAspect } from './multi-tester.aspect';
import { MultiTester } from './multi-tester.tester';

export class MultiTesterMain {
  /**
   * create a multi-tester `Tester` instance.
   * @param testers list of testers to include.
   */
  createTester(testers: Tester[]) {
    return new MultiTester(MultiTesterAspect.id, testers);
  }

  static runtime = MainRuntime;

  static async provider() {
    return new MultiTesterMain();
  }
}

MultiTesterAspect.addRuntime(MultiTesterMain);
