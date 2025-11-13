import { MochaTester } from '@teambit/defender.mocha-tester';

export class MochaOnlyTestEnv {
  name = 'mocha-only-test-env';

  tester() {
    return MochaTester.from({});
  }
}

export default new MochaOnlyTestEnv();
