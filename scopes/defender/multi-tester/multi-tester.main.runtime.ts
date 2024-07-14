import { MainRuntime } from '@teambit/cli';
import { Tester } from '@teambit/tester';
import { LoggerAspect, LoggerMain, Logger } from '@teambit/logger';
import { MultiTesterAspect } from './multi-tester.aspect';
import { MultiTester } from './multi-tester.tester';

export class MultiTesterMain {
  constructor(private logger: Logger) {}

  /**
   *
   * @deprecated use jest tester from https://bit.cloud/teambit/defender/testers/multi-tester
   * create a multi-tester `Tester` instance.
   * @param testers list of testers to include.
   */
  createTester(testers: Tester[]) {
    this.logger.consoleWarning(
      `The 'MultiTester' aspect is deprecated. Please use the 'multi tester' component instead. For more details, visit: https://${getCloudDomain()}/teambit/defender/testers/multi-tester`
    );
    return new MultiTester(MultiTesterAspect.id, testers);
  }

  static runtime = MainRuntime;
  static dependencies = [LoggerAspect];

  static async provider([loggerAspect]: [LoggerMain]) {
    const logger = loggerAspect.createLogger(MultiTesterAspect.id);
    return new MultiTesterMain(logger);
  }
}

MultiTesterAspect.addRuntime(MultiTesterMain);
