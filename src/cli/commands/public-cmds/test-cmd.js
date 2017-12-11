/** @flow */
import Command from '../../command';
import { test } from '../../../api/consumer';
import { paintAllSpecsResults, paintSummarySpecsResults } from '../../chalk-box';

export default class Test extends Command {
  name = 'test [id]';
  description = 'test any set of components with configured tester (component tester or as defined in bit.json)';
  alias = 't';
  opts = [['v', 'verbose', 'showing npm verbose output for inspection']];
  loader = true;
  migration = true;

  action(
    [id]: [string],
    {
      verbose
    }: {
      verbose: ?boolean
    }
  ): Promise<any> {
    return test(id, verbose);
  }

  report(results: any): string {
    if (Array.isArray(results)) return paintAllSpecsResults(results) + paintSummarySpecsResults(results);
    return "couldn't get test results...";
  }
}
