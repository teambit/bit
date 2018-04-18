/** @flow */
import { loadConsumer, Consumer } from '../../../consumer';
import Component from '../../../consumer/component/consumer-component';
import SpecsResults from '../../../consumer/specs-results';
import { BitId } from '../../../bit-id';
import loader from '../../../cli/loader';
import ComponentsList from '../../../consumer/component/components-list';
import ConsumerComponent from '../../../consumer/component';
import { BEFORE_LOADING_COMPONENTS } from '../../../cli/loader/loader-messages';
import { TESTS_FORK_LEVEL } from '../../../constants';
import specsRunner from '../../../specs-runner/specs-runner';

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
  forkLevel: ForkLevel = TESTS_FORK_LEVEL.COMPONENT,
  verbose: ?boolean
): Promise<ConsumerComponent> {
  if (forkLevel === TESTS_FORK_LEVEL.NONE) {
    return testInProcess(id, verbose);
  }
  if (forkLevel === TESTS_FORK_LEVEL.ONE) {
    const ids = id ? [id] : undefined;
    return specsRunner({ ids, forkLevel, verbose });
  }
  if (forkLevel === TESTS_FORK_LEVEL.COMPONENT) {
    const consumer: Consumer = await loadConsumer();
    const components = await _getComponents(consumer, id, verbose);
    const ids = components.map(component => component.id.toString());
    const results = await specsRunner({ ids, forkLevel, verbose });
    return results;
  }
});

export const testInProcess = async (
  id?: string,
  verbose: ?boolean
): Promise<Array<{ component: Component, specs: SpecsResults }>> => {
  const consumer: Consumer = await loadConsumer();
  const components = await _getComponents(consumer, id, verbose);
  return consumer.scope.testMultiple({ components, consumer, verbose });
};

const _getComponents = async (consumer: Consumer, id?: string, verbose: ?boolean) => {
  if (id) {
    const idParsed = BitId.parse(id);
    const component = await consumer.loadComponent(idParsed);
    return [component];
  }
  const componentsList = new ComponentsList(consumer);
  loader.start(BEFORE_LOADING_COMPONENTS);
  const components = await componentsList.newAndModifiedComponents();
  await consumer.scope.buildMultiple(components, consumer, verbose);
  return components;
};
