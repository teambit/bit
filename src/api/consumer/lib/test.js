/** @flow */
import { loadConsumer, Consumer } from '../../../consumer';
import { BitId } from '../../../bit-id';
import BitMap from '../../../consumer/bit-map';
import ComponentsList from '../../../consumer/component/components-list';
import Bit from '../../../consumer/component';
import loader from '../../../cli/loader';
import { BEFORE_RUNNING_SPECS, BEFORE_LOADING_COMPONENTS } from '../../../cli/loader/loader-messages';

export async function test(id: string, verbose: boolean = true): Promise<Bit> {
  const consumer: Consumer = await loadConsumer();
  const idParsed = BitId.parse(id);
  const component = await consumer.loadComponent(idParsed);
  if (!component.testerId) return { component, missingTester: true };
  loader.start(BEFORE_RUNNING_SPECS);
  const result = await consumer.runComponentSpecs(idParsed, verbose);
  return { specs: result, component };
}

export async function testAll(verbose: boolean = true): Promise<Bit> {
  const consumer = await loadConsumer();
  const componentsList = new ComponentsList(consumer);
  const bitMap = await BitMap.load(consumer.getPath());
  loader.start(BEFORE_LOADING_COMPONENTS);
  const newAndModifiedComponents = await componentsList.newAndModifiedComponents();
  loader.start(BEFORE_RUNNING_SPECS);
  const specsResults = newAndModifiedComponents.map(async (component) => {
    if (!component.testerId) {
      return { component, missingTester: true };
    }
    const result = await component.runSpecs({ scope: consumer.scope, consumer, bitMap, verbose });
    return { specs: result, component };
  });

  return Promise.all(specsResults);
}
