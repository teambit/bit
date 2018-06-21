/** @flow */
import semver from 'semver';
import R from 'ramda';
import { loadConsumer, Consumer } from '../../../consumer';
import ComponentsList from '../../../consumer/component/components-list';
import { BitId } from '../../../bit-id';
import HooksManager from '../../../hooks';
import { PRE_TAG_HOOK, POST_TAG_HOOK, PRE_TAG_ALL_HOOK, POST_TAG_ALL_HOOK } from '../../../constants';
import InvalidVersion from './exceptions/invalid-version';
import { Analytics } from '../../../analytics/analytics';

const HooksManagerInstance = HooksManager.getInstance();

export async function commitAction(args: {
  id: string,
  message: string,
  exactVersion: ?string,
  releaseType: string,
  force: ?boolean,
  verbose?: boolean,
  ignoreMissingDependencies?: boolean,
  ignoreNewestVersion: boolean,
  skipTests: boolean
}) {
  const {
    id,
    message,
    exactVersion,
    releaseType,
    force,
    verbose,
    ignoreMissingDependencies,
    ignoreNewestVersion,
    skipTests
  } = args;
  const validExactVersion = _validateVersion(exactVersion);
  HooksManagerInstance.triggerHook(PRE_TAG_HOOK, args);
  const consumer: Consumer = await loadConsumer();
  const componentsList = new ComponentsList(consumer);
  const newComponents = await componentsList.listNewComponents();
  if (!force) {
    const componentStatus = await consumer.getComponentStatusById(BitId.parse(id));
    if (componentStatus.modified === false) return null;
  }
  const commitResults = await consumer.tag(
    [id],
    message,
    validExactVersion,
    releaseType,
    force,
    verbose,
    ignoreMissingDependencies,
    ignoreNewestVersion,
    skipTests
  );
  commitResults.newComponents = newComponents;
  HooksManagerInstance.triggerHook(POST_TAG_HOOK, commitResults);
  await consumer.onDestroy();
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
  ignoreNewestVersion: boolean,
  skipTests: boolean,
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
    ignoreNewestVersion,
    skipTests,
    scope,
    includeImported
  } = args;
  const validExactVersion = _validateVersion(exactVersion);
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
  const commitResults = await consumer.tag(
    commitPendingComponents,
    message,
    validExactVersion,
    releaseType,
    force,
    verbose,
    ignoreMissingDependencies,
    ignoreNewestVersion,
    skipTests
  );
  commitResults.warnings = warnings;

  commitResults.newComponents = newComponents;
  HooksManagerInstance.triggerHook(POST_TAG_ALL_HOOK, commitResults);
  Analytics.setExtraData(
    'num_components',
    R.concat(commitResults.taggedComponents, commitResults.autoTaggedComponents, commitResults.newComponents).length
  );
  await consumer.onDestroy();
  return commitResults;
}

function _validateVersion(version) {
  if (version) {
    const validVersion = semver.valid(version);
    if (!validVersion) throw new InvalidVersion(version);
    return validVersion;
  }
  return null;
}
