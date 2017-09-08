/** @flow */
import Command from '../../command';
import { test, testAll } from '../../../api/consumer';
import { paintAllSpecsResults } from '../../chalk-box';

export default class Test extends Command {
  name = 'test [id]';
  description = 'test any set of components with configured tester (component tester or as defined in bit.json)';
  alias = 't';
  opts = [
    ['e', 'environment', 'also pre install the required environment bit before running the build'],
    ['s', 'save', 'for running build and save the results in the model'],
    ['v', 'verbose', 'showing npm verbose output for inspection']
  ];
  loader = true;

  action(
    [id]: [string],
    {
      save,
      environment,
      verbose
    }: {
      save: ?boolean,
      environment: ?boolean,
      verbose: ?boolean
    }
  ): Promise<any> {
    if (!id) return testAll(verbose);
    return test(id, verbose);
  }

  report(results: any): string {
    if (results && Array.isArray(results)) return paintAllSpecsResults(results);
    if (results && typeof results === 'object') return paintAllSpecsResults([results]);
    return "couldn't get test results...";
  }
}
