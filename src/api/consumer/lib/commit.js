/** @flow */
import { loadConsumer } from '../../../consumer';
import InvalidIdOnCommit from './exceptions/invalid-id-on-commit';

export function commitAction({ id, message, force, verbose }:
{ id: string, message: string, force: ?bool, verbose?: bool }) {
  try {
    return loadConsumer()
    .then(consumer => consumer.commit(id, message, force, verbose));
  } catch (err) {
    return Promise.reject(new InvalidIdOnCommit(id));
  }
}

export async function commitAllAction({ message, force, verbose }:
{ message: string, force: ?bool, verbose?: bool }) {
  try {
    const consumer = await loadConsumer();
    return consumer.commitAll(message, force, verbose);
  } catch (err) {
    return Promise.reject(err);
  }
}
