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
import type { AutoTagResult } from '../../../scope/component-ops/auto-tag';
import GeneralError from '../../../error/general-error';

const HooksManagerInstance = HooksManager.getInstance();

export type TagResults = {
  taggedComponents: Component[],
  autoTaggedResults: AutoTagResult[],
  warnings: string[],
  newComponents: BitIds
};

export async function tagAction(args: {
  id: string,
  message: string,
  exactVersion: ?string,
  releaseType: string,
  force: ?boolean,
  verbose?: boolean,
  ignoreUnresolvedDependencies?: boolean,
  ignoreNewestVersion: boolean,
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
  const tagResults = await consumer.tag(
    new BitIds(bitId),
    message,
    validExactVersion,
    releaseType,
    force,
    verbose,
    ignoreUnresolvedDependencies,
    ignoreNewestVersion,
    skipTests
  );
  tagResults.newComponents = newComponents;
  HooksManagerInstance.triggerHook(POST_TAG_HOOK, tagResults);
  await consumer.onDestroy();
  return tagResults;
}

async function getCommitPendingComponents(
  consumer: Consumer,
  isAllScope: boolean,
  exactVersion: string,
  includeImported: boolean
): Promise<{ tagPendingComponents: BitId[], warnings: string[] }> {
  const componentsList = new ComponentsList(consumer);
  if (isAllScope) {
    return componentsList.listCommitPendingOfAllScope(exactVersion, includeImported);
  }
  const tagPendingComponents = await componentsList.listCommitPendingComponents();
  const warnings = [];
  return { tagPendingComponents, warnings };
}

export async function tagAllAction(args: {
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
    idWithWildcard
  } = args;
  const validExactVersion = _validateVersion(exactVersion);
  HooksManagerInstance.triggerHook(PRE_TAG_ALL_HOOK, args);
  const consumer = await loadConsumer();
  const componentsList = new ComponentsList(consumer);
  const newComponents = await componentsList.listNewComponents();
  const { tagPendingComponents, warnings } = await getCommitPendingComponents(
    consumer,
    scope,
    exactVersion,
    includeImported
  );
  if (R.isEmpty(tagPendingComponents)) return null;
  const componentsToTag = idWithWildcard
    ? ComponentsList.filterComponentsByWildcard(tagPendingComponents, idWithWildcard)
    : tagPendingComponents;

  const tagResults = await consumer.tag(
    componentsToTag,
    message,
    validExactVersion,
    releaseType,
    force,
    verbose,
    ignoreUnresolvedDependencies,
    ignoreNewestVersion,
    skipTests
  );
  tagResults.warnings = warnings;

  tagResults.newComponents = newComponents;
  HooksManagerInstance.triggerHook(POST_TAG_ALL_HOOK, tagResults);
  Analytics.setExtraData(
    'num_components',
    R.concat(tagResults.taggedComponents, tagResults.autoTaggedResults, tagResults.newComponents).length
  );
  await consumer.onDestroy();
  return tagResults;
}

function _validateVersion(version) {
  if (version) {
    const validVersion = semver.valid(version);
    if (!validVersion) throw new InvalidVersion(version);
    if (semver.prerelease(version)) throw new GeneralError(`error: a prerelease version "${version}" is not supported`);
    return validVersion;
  }
  return null;
}
