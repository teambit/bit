/** @flow */
import { loadConsumer, Consumer } from '../../../consumer';
import { BitId } from '../../../bit-id';
import ComponentsList from '../../../consumer/component/components-list';
import Bit from '../../../consumer/component';

export async function test(id: string, verbose: boolean = true): Promise<Bit> {
  const consumer: Consumer = await loadConsumer();
  return consumer.runComponentSpecs(BitId.parse(id), verbose)
}

export async function testAll(verbose: boolean = true): Promise<Bit> {
  const consumer = await loadConsumer();
  const componentsList = new ComponentsList(consumer);
  const newAndModifiedComponents = await componentsList.newAndModifiedComponents();
  const specsResults = newAndModifiedComponents.map(async (component) => {
    const result = await component.runSpecs({ scope: consumer.scope, consumer, verbose });
    return { specs: result, component };
  });

  return Promise.all(specsResults);
}
