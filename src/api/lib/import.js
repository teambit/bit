/** @flow */
import BitId from '../../bit-id';
import { loadConsumer } from '../../consumer';

export default function importAction({ bitId }: { bitId: string }): Promise<any> {
  return loadConsumer().then((consumer) => {
    return consumer.import(bitId);
  });
}
