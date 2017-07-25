/** @flow */
import Command from '../../command';
import { test, testAll } from '../../../api/consumer';
import { testInScope } from '../../../api/scope';
import { paintSpecsResults, paintAllSpecsResults } from '../../chalk-box';

export default class Test extends Command {
  name = 'test [id]';
  description = 'run component(s) unit tests';
  alias = 't';
  opts = [
    ['e', 'environment', 'also pre install the required environment bit before running the build'],
    ['s', 'save', 'for running build and save the results in the model'],
    ['v', 'verbose', 'showing npm verbose output for inspection'],
  ];

  action([id, ]: [string, ], { save, environment, verbose }: {
    save: ?bool,
    environment: ?bool,
    verbose: ?bool,
  }): Promise<any> {
    if (!id) return testAll();
    return test(id);
  }

  report(results: any): string {
    if (results && Array.isArray(results)) {
      return results.map(res => paintSpecsResults(res));
    }

    return 'couldn\'t get test results...';
  }
}
