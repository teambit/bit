import R from 'ramda';
import semver from 'semver';
import { Analytics } from '../../../analytics/analytics';
import { BitId, BitIds } from '../../../bit-id';
import { POST_TAG_ALL_HOOK, POST_TAG_HOOK, PRE_TAG_ALL_HOOK, PRE_TAG_HOOK } from '../../../constants';
import { Consumer, loadConsumer } from '../../../consumer';
import Component from '../../../consumer/component';
import ComponentsList from '../../../consumer/component/components-list';
import HooksManager from '../../../hooks';
import { AutoTagResult } from '../../../scope/component-ops/auto-tag';
import hasWildcard from '../../../utils/string/has-wildcard';
import { validateVersion } from '../../../utils/semver-helper';
import loader from '../../../cli/loader';

const HooksManagerInstance = HooksManager.getInstance();

export type TagResults = {
  taggedComponents: Component[];
  autoTaggedResults: AutoTagResult[];
  warnings: string[];
  newComponents: BitIds;
  isSoftTag: boolean;
  publishedPackages: string[];
};

export const NOTHING_TO_TAG_MSG = 'nothing to tag';
export const AUTO_TAGGED_MSG = 'auto-tagged dependents';

export type BasicTagParams = {
  message: string;
  force: boolean;
  ignoreNewestVersion: boolean;
  skipTests: boolean;
  verbose: boolean;
  skipAutoTag: boolean;
  build: boolean;
  soft: boolean;
  persist: boolean;
  disableDeployPipeline: boolean;
  forceDeploy: boolean;
};

type TagParams = {
  exactVersion: string | undefined;
  releaseType: semver.ReleaseType;
  ignoreUnresolvedDependencies: boolean;
  ignoreNewestVersion: boolean;
  id: string;
  all: boolean;
  scope?: string | boolean;
  includeImported: boolean;
  incrementBy: number;
} & BasicTagParams;

export async function tagAction(tagParams: TagParams) {
  const {
    id,
    all,
    exactVersion,
    releaseType,
    force,
    ignoreUnresolvedDependencies,
    scope,
    includeImported,
    persist,
  } = tagParams;

  const idHasWildcard = hasWildcard(id);

  const isAll = Boolean(all || scope || idHasWildcard);

  const validExactVersion = validateVersion(exactVersion);
  const preHook = isAll ? PRE_TAG_ALL_HOOK : PRE_TAG_HOOK;
  HooksManagerInstance.triggerHook(preHook, tagParams);
  const consumer = await loadConsumer();
  const componentsList = new ComponentsList(consumer);
  loader.start('determine components to tag...');
  const newComponents = await componentsList.listNewComponents();
  const { bitIds, warnings } = await getComponentsToTag(
    consumer,
    Boolean(scope),
    exactVersion,
    includeImported,
    persist,
    force,
    isAll,
    id
  );
  if (R.isEmpty(bitIds)) return null;

  const consumerTagParams = {
    ...tagParams,
    ids: BitIds.fromArray(bitIds),
    exactVersion: validExactVersion,
    releaseType,
    ignoreUnresolvedDependencies,
  };
  const tagResults = await consumer.tag(consumerTagParams);
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  tagResults.warnings = warnings;

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  tagResults.newComponents = newComponents;
  const postHook = isAll ? POST_TAG_ALL_HOOK : POST_TAG_HOOK;
  HooksManagerInstance.triggerHook(postHook, tagResults);
  Analytics.setExtraData(
    'num_components',
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    R.concat(tagResults.taggedComponents, tagResults.autoTaggedResults, tagResults.newComponents).length
  );
  await consumer.onDestroy();
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  return tagResults;
}

async function getComponentsToTag(
  consumer: Consumer,
  isAllScope: boolean,
  exactVersion: string | undefined,
  includeImported: boolean,
  persist: boolean,
  force: boolean,
  isAll: boolean,
  id?: string
): Promise<{ bitIds: BitId[]; warnings: string[] }> {
  const warnings: string[] = [];
  const idHasWildcard = id && hasWildcard(id);
  if (id && !idHasWildcard) {
    const bitId = consumer.getParsedId(id);
    if (!force) {
      const componentStatus = await consumer.getComponentStatusById(bitId);
      if (componentStatus.modified === false) return { bitIds: [], warnings };
    }
    return { bitIds: [bitId], warnings };
  }
  const componentsList = new ComponentsList(consumer);
  const softTaggedComponents = componentsList.listSoftTaggedComponents();
  if (!isAll && persist) {
    return { bitIds: softTaggedComponents, warnings: [] };
  }

  const tagPendingComponents = isAllScope
    ? await componentsList.listTagPendingOfAllScope(includeImported)
    : await componentsList.listTagPendingComponents();

  if (isAllScope && exactVersion) {
    const tagPendingComponentsLatest = await consumer.scope.latestVersions(tagPendingComponents, false);
    tagPendingComponentsLatest.forEach((componentId) => {
      if (componentId.version && semver.gt(componentId.version, exactVersion)) {
        warnings.push(`warning: ${componentId.toString()} has a version greater than ${exactVersion}`);
      }
    });
  }

  if (persist) {
    // add soft-tagged into the tag-pending if not already exist
    softTaggedComponents.forEach((bitId) => {
      if (!tagPendingComponents.find((t) => t.isEqual(bitId))) {
        softTaggedComponents.push(bitId);
      }
    });
  }

  if (idHasWildcard) {
    const bitIds = ComponentsList.filterComponentsByWildcard(tagPendingComponents, id as string);
    return { bitIds, warnings };
  }

  return { bitIds: tagPendingComponents, warnings };
}
