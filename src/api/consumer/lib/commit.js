/** @flow */
import { loadConsumer } from '../../../consumer';
import InlineId from '../../../consumer/bit-inline-id';

export default function commitAction({ id, message, force, loader }:
{ id: string, message: string, force: ?bool, loader: any }) {
  const inlineId = InlineId.parse(id);
  return loadConsumer()
    .then(consumer => consumer.commit(inlineId, message, force, loader));
}
