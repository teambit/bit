/** @flow */
import R from 'ramda';
import Command from '../../command';
import { test } from '../../../api/consumer';
import { paintAllSpecsResults, paintSummarySpecsResults } from '../../chalk-box';
import { BASE_DOCS_DOMAIN, TESTS_FORK_LEVEL } from '../../../constants';
import GeneralError from '../../../error/general-error';

const validForkLevels = R.values(TESTS_FORK_LEVEL);
export default class Test extends Command {
  name = 'test [id]';
  description = `test any set of components with configured tester (as defined in bit.json)\n  https://${BASE_DOCS_DOMAIN}/docs/testing-components.html`;
  alias = '';
  opts = [
    ['v', 'verbose', 'showing npm verbose output for inspection'],
    ['', 'fork-level <forkLevel>', 'NONE / ONE / COMPONENT how many child process create for test running']
  ];
  loader = true;
  migration = true;

  action(
    [id]: [string],
    {
      verbose,
      forkLevel
    }: {
      verbose: ?boolean,
      forkLevel: ?string
    }
  ): Promise<any> {
    if (forkLevel && !validForkLevels.includes(forkLevel)) {
      return Promise.reject(new GeneralError(`fork level must be one of: ${validForkLevels.join()}`));
    }
    return test(id, forkLevel, verbose);
  }

  report(results: any): string {
    if (Array.isArray(results)) return paintAllSpecsResults(results) + paintSummarySpecsResults(results);
    return "couldn't get test results...";
  }
}
