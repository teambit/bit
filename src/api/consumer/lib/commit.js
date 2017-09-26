/** @flow */
import R from 'ramda';
import { loadConsumer, Consumer } from '../../../consumer';
import ComponentsList from '../../../consumer/component/components-list';

export async function commitAction({
  id,
  message,
  force,
  verbose,
  ignore
}: {
  id: string,
  message: string,
  force: ?boolean,
  verbose?: boolean,
  ignore?: boolean
}) {
  const consumer: Consumer = await loadConsumer();
  if (!force) {
    const isModified = await consumer.isComponentModifiedById(id);
    if (!isModified) return null;
  }
  const components = await consumer.commit([id], message, force, verbose, ignore);
  return R.head(components);
}

export async function commitAllAction({
  message,
  force,
  verbose,
  ignore
}: {
  message: string,
  force: ?boolean,
  verbose?: boolean,
  ignore?: boolean
}) {
  const consumer = await loadConsumer();
  const componentsList = new ComponentsList(consumer);
  const commitPendingComponents = await componentsList.listCommitPendingComponents();
  if (R.isEmpty(commitPendingComponents)) return null;
  return consumer.commit(commitPendingComponents, message, force, verbose, ignore);
}
