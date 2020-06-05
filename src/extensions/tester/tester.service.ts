import { EnvService, ExecutionContext } from '../environments';
import { Tester, TestResults } from './tester';

export class TesterService implements EnvService {
  constructor(
    /**
     * regex used to identify which files to test.
     */
    readonly testsRegex: string
  ) {}

  async run(context: ExecutionContext): Promise<TestResults> {
    const tester = context.apply<Tester>('getTester', [context]);
    return tester.test(context);
  }
}
