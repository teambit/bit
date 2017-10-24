/** @flow */
import R from 'ramda';
import { loadConsumer, Consumer } from '../../../consumer';
import ComponentsList from '../../../consumer/component/components-list';

export async function commitAction({
  id,
  message,
  releaseType,
  force,
  verbose,
  ignoreMissingDependencies
}: {
  id: string,
  message: string,
  releaseType: string,
  force: ?boolean,
  verbose?: boolean,
  ignoreMissingDependencies?: boolean
}) {
  const consumer: Consumer = await loadConsumer();
  if (!force) {
    const isModified = await consumer.isComponentModifiedById(id);
    if (!isModified) return null;
  }
  const components = await consumer.commit([id], message, releaseType, force, verbose, ignoreMissingDependencies);
  return R.head(components);
}

export async function commitAllAction({
  message,
  releaseType,
  force,
  verbose,
  ignoreMissingDependencies
}: {
  message: string,
  releaseType: string,
  force: ?boolean,
  verbose?: boolean,
  ignoreMissingDependencies?: boolean
}) {
  const consumer = await loadConsumer();
  const componentsList = new ComponentsList(consumer);
  const commitPendingComponents = await componentsList.listCommitPendingComponents();
  if (R.isEmpty(commitPendingComponents)) return null;
  return consumer.commit(commitPendingComponents, message, releaseType, force, verbose, ignoreMissingDependencies);
}
