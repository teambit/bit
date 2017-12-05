/** @flow */
import R from 'ramda';
import { loadConsumer, Consumer } from '../../../consumer';
import ComponentsList from '../../../consumer/component/components-list';
import HooksManager from '../../../hooks';
import { PRE_TAG_HOOK, POST_TAG_HOOK, PRE_TAG_ALL_HOOK, POST_TAG_ALL_HOOK } from '../../../constants';

const HooksManagerInstance = HooksManager.getInstance();

export async function commitAction(args: {
  id: string,
  message: string,
  exactVersion: ?string,
  releaseType: string,
  force: ?boolean,
  verbose?: boolean,
  ignoreMissingDependencies?: boolean
}) {
  const { id, message, exactVersion, releaseType, force, verbose, ignoreMissingDependencies } = args;
  HooksManagerInstance.triggerHook(PRE_TAG_HOOK, args);
  const consumer: Consumer = await loadConsumer();
  const componentsList = new ComponentsList(consumer);
  const newComponents = await componentsList.listNewComponents();
  if (!force) {
    const isModified = await consumer.isComponentModifiedById(id, true);
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
  HooksManagerInstance.triggerHook(POST_TAG_HOOK, commitResults);
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

export async function commitAllAction(args: {
  message: string,
  exactVersion: ?string,
  releaseType: string,
  force: ?boolean,
  verbose?: boolean,
  ignoreMissingDependencies?: boolean,
  scope?: boolean,
  includeImported?: boolean
}) {
  const {
    message,
    exactVersion,
    releaseType,
    force,
    verbose,
    ignoreMissingDependencies,
    scope,
    includeImported
  } = args;
  HooksManagerInstance.triggerHook(PRE_TAG_ALL_HOOK, args);
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
  HooksManagerInstance.triggerHook(POST_TAG_ALL_HOOK, commitResults);
  return commitResults;
}
