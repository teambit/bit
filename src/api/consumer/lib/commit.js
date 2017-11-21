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
  const componentsList = new ComponentsList(consumer);
  const newComponents = await componentsList.listNewComponents();
  if (!force) {
    const isModified = await consumer.isComponentModifiedById(id);
    if (!isModified) return null;
  }
  const commitResults = await consumer.commit(
    [id],
    message,
    exactVersion,
    releaseType,
    force,
    verbose,
    ignoreMissingDependencies
  );
  commitResults.newComponents = newComponents;
  return commitResults;
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
  const componentsList = new ComponentsList(consumer);
  const newComponents = await componentsList.listNewComponents();
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

  commitResults.newComponents = newComponents;
  return commitResults;
}
