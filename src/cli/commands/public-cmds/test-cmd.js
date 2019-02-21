/** @flow */
import R from 'ramda';
import Command from '../../command';
import { test } from '../../../api/consumer';
import { paintAllSpecsResults, paintSummarySpecsResults } from '../../chalk-box';
import { BASE_DOCS_DOMAIN, TESTS_FORK_LEVEL } from '../../../constants';
import GeneralError from '../../../error/general-error';
import type { SpecsResultsWithComponentId } from '../../../consumer/specs-results/specs-results';

const validForkLevels = R.values(TESTS_FORK_LEVEL);

let verboseReport = false;

export default class Test extends Command {
  name = 'test [id]';
  description = `test any set of components with a configured tester as defined in bit.json (by default applies only on modified components)\n  https://${BASE_DOCS_DOMAIN}/docs/testing-components.html)`;
  alias = '';
  opts = [
    ['a', 'all', 'test all components in your workspace, including unmodified components'],
    ['v', 'verbose', 'showing npm verbose output for inspection and prints stack trace'],
    ['', 'fork-level <forkLevel>', 'NONE / ONE / COMPONENT how many child process create for test running']
  ];
  loader = true;
  migration = true;

  async action(
    [id]: [string],
    {
      all,
      verbose,
      forkLevel
    }: {
      all: ?boolean,
      verbose: ?boolean,
      forkLevel: ?string
    }
  ): Promise<{ __code: number, data: SpecsResultsWithComponentId }> {
    if (id && all) {
      throw new GeneralError(
        'use "--all" to test all components or use a component ID to test a specific component. run tests to all new and modified components by removing all flags and parameters'
      );
    }
    if (forkLevel && !validForkLevels.includes(forkLevel)) {
      return Promise.reject(new GeneralError(`fork level must be one of: ${validForkLevels.join()}`));
    }
    verboseReport = verbose || false;
    const testRes = await test(id, forkLevel, all, verbose);
    const pass = testRes.every(comp => comp.pass);
    const res = {
      data: testRes,
      __code: pass ? 0 : 1
    };
    return res;
  }

  report(results: SpecsResultsWithComponentId): string {
    if (Array.isArray(results)) return paintAllSpecsResults(results, verboseReport) + paintSummarySpecsResults(results);
    return "couldn't get test results...";
  }
}
