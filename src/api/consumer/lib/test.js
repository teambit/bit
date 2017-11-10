/** @flow */
import { loadConsumer, Consumer } from '../../../consumer';
import { BitId } from '../../../bit-id';
import BitMap from '../../../consumer/bit-map';
import ComponentsList from '../../../consumer/component/components-list';
import Bit from '../../../consumer/component';

export default (async function test(id?: string, verbose: boolean = true): Promise<Bit> {
  const consumer: Consumer = await loadConsumer();
  const bitMap = await BitMap.load(consumer.getPath());
  let components;
  if (id) {
    const idParsed = BitId.parse(id);
    const component = await consumer.loadComponent(idParsed);
    components = [component];
  } else {
    const componentsList = new ComponentsList(consumer);
    components = await componentsList.newAndModifiedComponents();
  }

  const specsResults = components.map(async (component) => {
    if (!component.testerId) {
      return { component, missingTester: true };
    }
    const result = await component.runSpecs({ scope: consumer.scope, consumer, bitMap, verbose });
    return { specs: result, component };
  });

  return Promise.all(specsResults);
});
