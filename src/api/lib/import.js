/** @flow */
import BitId from '../../bit-id';
import { loadConsumer } from '../../consumer';

export default function importAction({ bitId }: { bitId: string }) {
  return loadConsumer().then((consumer) => {
    bitId = BitId.parse(bitId, consumer.bitJson.remotes);
    return bitId.remote.fetch(bitId);
  });
}
