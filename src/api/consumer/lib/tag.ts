import R from 'ramda';
import semver from 'semver';
import { compact } from 'lodash';
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
  disableTagAndSnapPipelines: boolean;
  forceDeploy: boolean;
  preRelease?: string;
};

type TagParams = {
  exactVersion: string | undefined;
  releaseType: semver.ReleaseType;
  ignoreIssues: boolean;
  ignoreNewestVersion: boolean;
  ids: string[];
  all: boolean;
  scope?: string | boolean;
  includeImported: boolean;
  incrementBy: number;
} & BasicTagParams;

export async function tagAction(tagParams: TagParams): Promise<TagResults | null> {
  const { ids, all, exactVersion, releaseType, force, ignoreIssues, scope, includeImported, persist } = tagParams;
  const idsHasWildcard = hasWildcard(ids);
  const isAll = Boolean(all || scope || idsHasWildcard);
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
    ids
  );
  if (R.isEmpty(bitIds)) return null;

  const consumerTagParams = {
    ...tagParams,
    ids: BitIds.fromArray(bitIds),
    exactVersion: validExactVersion,
    releaseType,
    ignoreIssues,
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
  ids: string[]
): Promise<{ bitIds: BitId[]; warnings: string[] }> {
  const warnings: string[] = [];
  const componentsList = new ComponentsList(consumer);
  if (persist) {
    const softTaggedComponents = componentsList.listSoftTaggedComponents();
    return { bitIds: softTaggedComponents, warnings: [] };
  }

  const tagPendingComponents = isAllScope
    ? await componentsList.listTagPendingOfAllScope(includeImported)
    : await componentsList.listTagPendingComponents();

  if (ids.length) {
    const bitIds = await Promise.all(
      ids.map(async (id) => {
        const [idWithoutVer, version] = id.split('@');
        const idHasWildcard = hasWildcard(id);
        if (idHasWildcard) {
          const allIds = ComponentsList.filterComponentsByWildcard(tagPendingComponents, idWithoutVer);
          return allIds.map((bitId) => bitId.changeVersion(version));
        }
        const bitId = consumer.getParsedId(idWithoutVer);
        if (!force) {
          const componentStatus = await consumer.getComponentStatusById(bitId);
          if (componentStatus.modified === false) return null;
        }
        return bitId.changeVersion(version);
      })
    );

    return { bitIds: compact(bitIds.flat()), warnings };
  }

  if (isAllScope && exactVersion) {
    const tagPendingComponentsLatest = await consumer.scope.latestVersions(tagPendingComponents, false);
    tagPendingComponentsLatest.forEach((componentId) => {
      if (componentId.version && semver.gt(componentId.version, exactVersion)) {
        warnings.push(`warning: ${componentId.toString()} has a version greater than ${exactVersion}`);
      }
    });
  }

  return { bitIds: tagPendingComponents.map((id) => id.changeVersion(undefined)), warnings };
}
