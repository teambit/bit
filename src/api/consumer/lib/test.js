/** @flow */
import { loadConsumer, Consumer } from '../../../consumer';
import { BitId } from '../../../bit-id';
import loader from '../../../cli/loader';
import ComponentsList from '../../../consumer/component/components-list';
import Component from '../../../consumer/component';
import { BEFORE_LOADING_COMPONENTS } from '../../../cli/loader/loader-messages';

export default (async function test(
  id?: string,
  verbose: ?boolean
): Promise<Array<{ component: Component, specs: Object }>> {
  const consumer: Consumer = await loadConsumer();
  const getComponents = async () => {
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
  const components = await getComponents();

  const testsResults = await consumer.scope.testMultiple({ components, consumer, verbose });
  await consumer.onDestroy();
  return testsResults;
});
