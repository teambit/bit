/** @flow */
import { loadConsumer, Consumer } from '../../../consumer';
import loader from '../../../cli/loader';
import ComponentsList from '../../../consumer/component/components-list';
import { BEFORE_LOADING_COMPONENTS } from '../../../cli/loader/loader-messages';
import { TESTS_FORK_LEVEL } from '../../../constants';
import specsRunner from '../../../specs-runner/specs-runner';
import GeneralError from '../../../error/general-error';
import type { SpecsResultsWithComponentId } from '../../../consumer/specs-results/specs-results';

export type ForkLevel = 'NONE' | 'ONE' | 'COMPONENT';

/**
 * Run tests for all modified components or for specific component
 * @param {string} id
 * @param {'NONE' | 'ONE' | 'COMPONENT'} forkLevel - run the tests in the current process
 * or in child process, or in child process for each component
 * @param {boolean} verbose
 */
export default (async function test(
  id?: string,
  forkLevel: ForkLevel = TESTS_FORK_LEVEL.ONE,
  includeUnmodified: boolean = false,
  verbose: ?boolean
): Promise<SpecsResultsWithComponentId> {
  if (forkLevel === TESTS_FORK_LEVEL.NONE) {
    return testInProcess(id, includeUnmodified, verbose);
  }
  if (forkLevel === TESTS_FORK_LEVEL.ONE) {
    const ids = id ? [id] : undefined;
    // $FlowFixMe
    return specsRunner({ ids, forkLevel, includeUnmodified, verbose });
  }
  if (forkLevel === TESTS_FORK_LEVEL.COMPONENT) {
    const consumer: Consumer = await loadConsumer();
    const components = await _getComponentsAfterBuild(consumer, id, includeUnmodified, verbose);
    const ids = components.map(component => component.id.toString());
    // $FlowFixMe
    const results = await specsRunner({ ids, forkLevel, verbose });
    return results;
  }
  throw new GeneralError('unknown fork level, fork level must be one of: NONE, ONE, COMPONENT');
});

export const testInProcess = async (
  id?: string,
  includeUnmodified: boolean = false,
  verbose: ?boolean,
  dontPrintEnvMsg: ?boolean
): Promise<SpecsResultsWithComponentId> => {
  const consumer: Consumer = await loadConsumer();
  const components = await _getComponentsAfterBuild(consumer, id, includeUnmodified, verbose);
  const testsResults = await consumer.scope.testMultiple({ components, consumer, verbose, dontPrintEnvMsg });
  loader.stop();
  await consumer.onDestroy();
  return testsResults;
};

const _getComponentsAfterBuild = async (
  consumer: Consumer,
  id?: string,
  includeUnmodified: boolean = false,
  verbose: ?boolean
) => {
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
  await consumer.scope.buildMultiple(components, consumer, false, verbose);
  return components;
};
