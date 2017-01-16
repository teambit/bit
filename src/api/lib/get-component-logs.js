/** @flow */
import { loadConsumer } from '../../consumer';
import { BitId } from '../../bit-id';

export default function getComponentLogs(id: string) {
  return loadConsumer()
    .then(consumer => consumer.scope.loadComponentLogs(BitId.parse(id)));
}
