import loader from '../../../cli/loader';
import { BEFORE_LOADING_COMPONENTS, BEFORE_RUNNING_SPECS } from '../../../cli/loader/loader-messages';
import { TESTS_FORK_LEVEL } from '../../../constants';
import { Consumer, loadConsumer } from '../../../consumer';
import ComponentsList from '../../../consumer/component/components-list';
import { SpecsResultsWithMetaData } from '../../../consumer/specs-results/specs-results';
import GeneralError from '../../../error/general-error';
import specsRunner from '../../../specs-runner/specs-runner';

export type ForkLevel = 'NONE' | 'ONE' | 'COMPONENT';

/**
 * Run tests for all modified components or for specific component
 * @param {string} id
 * @param {'NONE' | 'ONE' | 'COMPONENT'} forkLevel - run the tests in the current process
 * or in child process, or in child process for each component
 * @param {boolean} verbose
 */
export default async function test(
  id: string | undefined,
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  forkLevel: ForkLevel = TESTS_FORK_LEVEL.NONE,
  includeUnmodified = false,
  verbose?: boolean | null
): Promise<SpecsResultsWithMetaData> {
  loader.start(BEFORE_RUNNING_SPECS);

  if (forkLevel === TESTS_FORK_LEVEL.NONE) {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return testInProcess(id, includeUnmodified, verbose);
  }
  if (forkLevel === TESTS_FORK_LEVEL.ONE) {
    const ids = id ? [id] : undefined;
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return specsRunner({ ids, forkLevel, includeUnmodified, verbose });
  }
  if (forkLevel === TESTS_FORK_LEVEL.COMPONENT) {
    const consumer: Consumer = await loadConsumer();
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const components = await _getComponentsAfterBuild(consumer, id, includeUnmodified, verbose);
    const ids = components.map((component) => component.id.toString());
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const results = await specsRunner({ ids, forkLevel, verbose });
    // @ts-ignore obsolete code, no need to fix.
    return results;
  }
  throw new GeneralError('unknown fork level, fork level must be one of: NONE, ONE, COMPONENT');
}

export async function testInProcess(
  id: string | undefined,
  includeUnmodified = false,
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  verbose: boolean | null | undefined,
  dontPrintEnvMsg: boolean | null | undefined
): Promise<SpecsResultsWithMetaData> {
  const consumer: Consumer = await loadConsumer();
  const components = await _getComponentsAfterBuild(consumer, id, includeUnmodified, verbose, dontPrintEnvMsg);
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  const testsResults = await consumer.scope.testMultiple({ components, consumer, verbose, dontPrintEnvMsg });
  loader.stop();
  await consumer.onDestroy();
  return {
    type: 'results',
    results: testsResults,
  };
}

async function _getComponentsAfterBuild(
  consumer: Consumer,
  id?: string,
  includeUnmodified = false,
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  verbose: boolean | null | undefined,
  dontPrintEnvMsg: boolean | null | undefined
) {
  let components;
  if (id) {
    const idParsed = consumer.getParsedId(id);
    const component = await consumer.loadComponent(idParsed);
    components = [component];
  } else {
    const componentsList = new ComponentsList(consumer);
    loader.start(BEFORE_LOADING_COMPONENTS);
    if (includeUnmodified) {
      components = await componentsList.authoredAndImportedComponents();
    } else {
      components = await componentsList.newModifiedAndAutoTaggedComponents();
    }
    loader.stop();
  }
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  await consumer.scope.buildMultiple(components, consumer, false, verbose, dontPrintEnvMsg);
  return components;
}
