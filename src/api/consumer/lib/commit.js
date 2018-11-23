/** @flow */
import semver from 'semver';
import R from 'ramda';
import { loadConsumer, Consumer } from '../../../consumer';
import ComponentsList from '../../../consumer/component/components-list';
import { BitId, BitIds } from '../../../bit-id';
import HooksManager from '../../../hooks';
import { PRE_TAG_HOOK, POST_TAG_HOOK, PRE_TAG_ALL_HOOK, POST_TAG_ALL_HOOK } from '../../../constants';
import InvalidVersion from './exceptions/invalid-version';
import { Analytics } from '../../../analytics/analytics';
import Component from '../../../consumer/component';
import ModelComponent from '../../../scope/models/model-component';

const HooksManagerInstance = HooksManager.getInstance();

export type TagResults = {
  taggedComponents: Component[],
  autoTaggedComponents: ModelComponent[],
  warnings: string[],
  newComponents: BitIds
};

export async function commitAction(args: {
  id: string,
  message: string,
  exactVersion: ?string,
  releaseType: string,
  force: ?boolean,
  verbose?: boolean,
  ignoreUnresolvedDependencies?: boolean,
  ignoreNewestVersion: boolean,
  devMode: boolean,
  skipTests: boolean
}): Promise<TagResults> {
  const {
    id,
    message,
    exactVersion,
    releaseType,
    force,
    verbose,
    ignoreUnresolvedDependencies,
    ignoreNewestVersion,
    devMode,
    skipTests
  } = args;
  const validExactVersion = _validateVersion(exactVersion);
  HooksManagerInstance.triggerHook(PRE_TAG_HOOK, args);
  const consumer: Consumer = await loadConsumer();
  const componentsList = new ComponentsList(consumer);
  const newComponents = await componentsList.listNewComponents();
  const bitId = consumer.getParsedId(id);
  if (!force) {
    const componentStatus = await consumer.getComponentStatusById(bitId);
    if (componentStatus.modified === false) return null;
  }
  const commitResults = await consumer.tag(
    new BitIds(bitId),
    message,
    validExactVersion,
    releaseType,
    force,
    verbose,
    ignoreUnresolvedDependencies,
    ignoreNewestVersion,
    skipTests,
    devMode
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
): Promise<{ commitPendingComponents: BitId[], warnings: string[] }> {
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
  ignoreUnresolvedDependencies?: boolean,
  ignoreNewestVersion: boolean,
  skipTests: boolean,
  scope?: boolean,
  includeImported?: boolean,
  devMode: boolean,
  idWithWildcard?: string
}): Promise<TagResults> {
  const {
    message,
    exactVersion,
    releaseType,
    force,
    verbose,
    ignoreUnresolvedDependencies,
    ignoreNewestVersion,
    skipTests,
    scope,
    includeImported,
    devMode,
    idWithWildcard
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
  const componentsToTag = idWithWildcard
    ? ComponentsList.filterComponentsByWildcard(commitPendingComponents, idWithWildcard)
    : commitPendingComponents;

  const commitResults = await consumer.tag(
    componentsToTag,
    message,
    validExactVersion,
    releaseType,
    force,
    verbose,
    ignoreUnresolvedDependencies,
    ignoreNewestVersion,
    skipTests,
    devMode
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
