/** @flow */
import { loadConsumer } from '../../../consumer';
import { BitId } from '../../../bit-id';

export default function getComponentLogs(id: string) {
  return loadConsumer().then(async (consumer) => {
    const bitId = BitId.parse(id);
    const component = await consumer.loadComponent(id);
    if (!bitId.scope && component) {
      if (component.box === bitId.box && component.name === bitId.name) bitId.scope = component.scope;
    }
    return consumer.scope.loadComponentLogs(bitId);
  });
}
