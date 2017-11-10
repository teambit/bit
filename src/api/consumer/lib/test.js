/** @flow */
import { loadConsumer, Consumer } from '../../../consumer';
import { BitId } from '../../../bit-id';
import BitMap from '../../../consumer/bit-map';
import ComponentsList from '../../../consumer/component/components-list';
import Bit from '../../../consumer/component';

export async function test(id: string, verbose: boolean = true): Promise<Bit> {
  const consumer: Consumer = await loadConsumer();
  const idParsed = BitId.parse(id);
  const component = await consumer.loadComponent(idParsed);
  if (!component.testerId) return { component, missingTester: true };
  const result = await consumer.runComponentSpecs(idParsed, verbose);
  return [{ specs: result, component }];
}

export async function testAll(verbose: boolean = true): Promise<Bit> {
  const consumer = await loadConsumer();
  const componentsList = new ComponentsList(consumer);
  const bitMap = await BitMap.load(consumer.getPath());
  const newAndModifiedComponents = await componentsList.newAndModifiedComponents();
  const specsResults = newAndModifiedComponents.map(async (component) => {
    if (!component.testerId) {
      return { component, missingTester: true };
    }
    const result = await component.runSpecs({ scope: consumer.scope, consumer, bitMap, verbose });
    return { specs: result, component };
  });

  return Promise.all(specsResults);
}
