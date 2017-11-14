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

async function getCommitPendingComponents(
  consumer: Consumer,
  isAllScope: boolean,
  exactVersion: string,
  includeImported: boolean
): Promise<{ commitPendingComponents: string[], warnings: string[] }> {
  const componentsList = new ComponentsList(consumer);
  if (isAllScope) {
    return componentsList.listCommitPendingOfAllScope(exactVersion, includeImported);
  }
  const commitPendingComponents = await componentsList.listCommitPendingComponents();
  const warnings = [];
  return { commitPendingComponents, warnings };
}

export async function commitAllAction({
  message,
  exactVersion,
  releaseType,
  force,
  verbose,
  ignoreMissingDependencies,
  scope,
  includeImported
}: {
  message: string,
  exactVersion: ?string,
  releaseType: string,
  force: ?boolean,
  verbose?: boolean,
  ignoreMissingDependencies?: boolean,
  scope?: boolean,
  includeImported?: boolean
}) {
  const consumer = await loadConsumer();
  const { commitPendingComponents, warnings } = await getCommitPendingComponents(
    consumer,
    scope,
    exactVersion,
    includeImported
  );
  if (R.isEmpty(commitPendingComponents)) return null;
  const commitResults = await consumer.commit(
    commitPendingComponents,
    message,
    exactVersion,
    releaseType,
    force,
    verbose,
    ignoreMissingDependencies
  );
  commitResults.warnings = warnings;
  return commitResults;
}
