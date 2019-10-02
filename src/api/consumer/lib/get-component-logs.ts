/** @flow */
import { loadConsumer } from '../../../consumer';
import { BitId } from '../../../bit-id';

export default function getComponentLogs(id: string) {
  return loadConsumer().then(async (consumer) => {
    const bitId: BitId = consumer.getParsedId(id);
    return consumer.scope.loadComponentLogs(bitId);
  });
}
