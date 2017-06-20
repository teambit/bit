/** @flow */
import { loadConsumer } from '../../../consumer';
import { BitId } from '../../../bit-id';
import InvalidIdOnCommit from './exceptions/invalid-id-on-commit';
import ComponentsList from '../../../consumer/component/components-list';

export function commitAction({ id, message, force, verbose }:
{ id: string, message: string, force: ?bool, verbose?: bool }) {
  try {
    const componentId = BitId.parse(id);
    return loadConsumer()
    .then(consumer => consumer.commit(componentId, message, force, verbose));
  } catch (err) {
    return Promise.reject(new InvalidIdOnCommit(id));
  }
}

export async function commitAllAction({ message, force, verbose }:
{ message: string, force: ?bool, verbose?: bool }) {
  try {
    const consumer = await loadConsumer();
    const componentsList = new ComponentsList(consumer);
    const commitPendingComponents = await componentsList.listCommitPendingComponents();
    return Promise.all(commitPendingComponents.map((id) => {
      const bitId = BitId.parse(id);
      return consumer.commit(bitId, message, force, verbose);
    }));
  } catch (err) {
    return Promise.reject(err);
  }
}
