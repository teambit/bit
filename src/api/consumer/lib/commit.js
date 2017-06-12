/** @flow */
import { loadConsumer } from '../../../consumer';
import { BitId } from '../../../bit-id';
import InvalidIdOnCommit from './exceptions/invalid-id-on-commit';

export default function commitAction({ id, message, force, verbose }:
{ id: string, message: string, force: ?bool, verbose?: bool }) {
  try {
    const componentId = BitId.parse(id);
    return loadConsumer()
    .then(consumer => consumer.commit(componentId, message, force, verbose));
  } catch (err) {
    return Promise.reject(new InvalidIdOnCommit(id));
  }
}
