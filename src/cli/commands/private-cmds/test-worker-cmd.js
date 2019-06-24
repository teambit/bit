/** @flow */
import Command from '../../command';
// import { test } from '../../../api/consumer';
import run from '../../../specs-runner/worker';
import { BASE_DOCS_DOMAIN } from '../../../constants';
import GeneralError from '../../../error/general-error';
import type { SerializedSpecsResultsWithComponentId } from '../../../specs-runner/worker';

export default class TestWorker extends Command {
  name = 'test-worker [ids]';
  description = `test any set of components with a configured tester as defined in bit.json (by default applies only on modified components)\n  https://${BASE_DOCS_DOMAIN}/docs/testing-components.html)`;
  private = true;
  alias = '';
  opts = [
    ['a', 'all', 'test all components in your workspace, including unmodified components'],
    ['v', 'verbose', 'showing npm verbose output for inspection and prints stack trace']
  ];

  async action(
    [ids]: [string],
    {
      all,
      verbose
    }: {
      all: ?boolean,
      verbose: ?boolean
    }
  ): Promise<SerializedSpecsResultsWithComponentId> {
    if (ids && all) {
      throw new GeneralError(
        'use "--all" to test all components or use a component ID to test a specific component. run tests to all new and modified components by removing all flags and parameters'
      );
    }
    const idsArr = ids ? ids.split() : undefined;
    const includeUnmodified = all || false;
    const res = run({ ids: idsArr, includeUnmodified, verbose: verbose || false });
    return res;
  }

  report(results: SerializedSpecsResultsWithComponentId): string {
    return JSON.stringify(results, null, 2);
  }
}
