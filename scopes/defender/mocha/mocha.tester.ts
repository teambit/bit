import { Logger } from '@teambit/logger';
import { Tester, TesterContext, Tests } from '@teambit/tester';
import Mocha from 'mocha';

export class MochaTester implements Tester {
  displayName = 'Mocha';
  constructor(readonly id: string, private logger: Logger, readonly mochaConfig: any, private mochaModule: Mocha) {}
  test(context: TesterContext): Promise<Tests> {
    // this.mochaModule.
    throw new Error('Method not implemented.');
  }
  version(): string {
    return 'N/A';
  }
}
