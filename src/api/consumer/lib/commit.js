/** @flow */
import { loadConsumer } from '../../../consumer';
import InlineId from '../../../consumer/bit-inline-id';

export default function commitAction({ id, message, loader }: { id: string, message: string, loader: any }) {
  return loadConsumer()
    .then(consumer => consumer.commit(InlineId.parse(id), message, loader));
    // @TODO - maybe need to verify before commit and not after, because error is thrown on commit when the compiler is not exists
}
