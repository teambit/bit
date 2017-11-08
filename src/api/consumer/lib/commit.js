/** @flow */
import R from 'ramda';
import { loadConsumer, Consumer } from '../../../consumer';
import ComponentsList from '../../../consumer/component/components-list';

export async function commitAction({
  id,
  message,
  exactVersion,
  releaseType,
  force,
  verbose,
  ignoreMissingDependencies
}: {
  id: string,
  message: string,
  exactVersion: ?string,
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
  return consumer.commit([id], message, exactVersion, releaseType, force, verbose, ignoreMissingDependencies);
}

export async function commitAllAction({
  message,
  exactVersion,
  releaseType,
  force,
  verbose,
  ignoreMissingDependencies
}: {
  message: string,
  exactVersion: ?string,
  releaseType: string,
  force: ?boolean,
  verbose?: boolean,
  ignoreMissingDependencies?: boolean
}) {
  const consumer = await loadConsumer();
  const componentsList = new ComponentsList(consumer);
  const commitPendingComponents = await componentsList.listCommitPendingComponents();
  if (R.isEmpty(commitPendingComponents)) return null;
  return consumer.commit(
    commitPendingComponents,
    message,
    exactVersion,
    releaseType,
    force,
    verbose,
    ignoreMissingDependencies
  );
}
