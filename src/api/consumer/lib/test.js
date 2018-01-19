/** @flow */
import { loadConsumer, Consumer } from '../../../consumer';
import { BitId } from '../../../bit-id';
import loader from '../../../cli/loader';
import ComponentsList from '../../../consumer/component/components-list';
import Bit from '../../../consumer/component';
import { BEFORE_LOADING_COMPONENTS, BEFORE_RUNNING_SPECS } from '../../../cli/loader/loader-messages';
import { build } from './build';

export default (async function test(id?: string, verbose: boolean = true): Promise<Bit> {
  const consumer: Consumer = await loadConsumer();
  let components;
  if (id) {
    const idParsed = BitId.parse(id);
    const component = await consumer.loadComponent(idParsed);
    components = [component];
  } else {
    const componentsList = new ComponentsList(consumer);
    loader.start(BEFORE_LOADING_COMPONENTS);
    components = await componentsList.newAndModifiedComponents();
  }

  loader.start(BEFORE_RUNNING_SPECS);
  await Promise.all(components.map(component => build(component.id.toString(), verbose)));
  const specsResults = components.map(async (component) => {
    if (!component.testerId) {
      return { component, missingTester: true };
    }
    const result = await component.runSpecs({ scope: consumer.scope, consumer, verbose });
    return { specs: result, component };
  });

  return Promise.all(specsResults);
});
