import R from 'ramda';
import Command, { CommandOptions } from '../../command';
import { test } from '../../../api/consumer';
import { paintAllSpecsResults, paintSummarySpecsResults } from '../../chalk-box';
import { BASE_DOCS_DOMAIN, TESTS_FORK_LEVEL } from '../../../constants';
import GeneralError from '../../../error/general-error';
import { SpecsResultsWithMetaData } from '../../../consumer/specs-results/specs-results';

const validForkLevels = R.values(TESTS_FORK_LEVEL);

let verboseReport = false;

export default class Test extends Command {
  name = 'test [id]';
  description = `test any set of components with a configured tester as defined in bit.json (by default applies only on modified components)\n  https://${BASE_DOCS_DOMAIN}/docs/testing-components)`;
  alias = '';
  opts = [
    ['a', 'all', 'test all components in your workspace, including unmodified components'],
    ['v', 'verbose', 'showing npm verbose output for inspection and prints stack trace'],
    ['j', 'json', 'return results in json format'],
    ['', 'fork-level <forkLevel>', 'NONE / ONE / COMPONENT how many child process create for test running']
  ] as CommandOptions;
  loader = true;
  migration = true;
  remoteOp = true; // In case the compiler is not installed yet

  async action(
    [id]: [string],
    {
      all,
      verbose,
      forkLevel
    }: {
      all: boolean | null | undefined;
      verbose: boolean | null | undefined;
      forkLevel: string | null | undefined;
    }
  ): Promise<{ __code: number; data: SpecsResultsWithMetaData }> {
    if (id && all) {
      throw new GeneralError(
        'use "--all" to test all components or use a component ID to test a specific component. run tests to all new and modified components by removing all flags and parameters'
      );
    }
    if (forkLevel && !validForkLevels.includes(forkLevel)) {
      return Promise.reject(new GeneralError(`fork level must be one of: ${validForkLevels.join()}`));
    }
    verboseReport = verbose || false;
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const testRes = await test(id, forkLevel, all, verbose);
    const pass = testRes.results.every(comp => comp.pass);
    const res = {
      data: testRes,
      __code: pass ? 0 : 1
    };
    return res;
  }

  report(results: SpecsResultsWithMetaData, args: string[], flags: Record<string, any>): string {
    if (flags.json) return JSON.stringify(results, null, 2);
    const specsResultsWithComponentId = results.results;
    if (specsResultsWithComponentId && Array.isArray(specsResultsWithComponentId)) {
      return paintAllSpecsResults(results, verboseReport) + paintSummarySpecsResults(specsResultsWithComponentId);
    }
    return "couldn't get test results...";
  }
}
