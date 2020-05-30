import { EnvService, EnvContext } from '../environments';
import { Tester, TestResults } from './tester';

export class TesterService implements EnvService {
  async run(context: EnvContext): Promise<TestResults> {
    const tester = context.apply<Tester>('test', [context]);
    return tester.test(context);
  }
}
