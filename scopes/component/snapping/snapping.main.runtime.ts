import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import CommunityAspect, { CommunityMain } from '@teambit/community';
import WorkspaceAspect, { Workspace } from '@teambit/workspace';
import R from 'ramda';
import semver from 'semver';
import { compact } from 'lodash';
import { Analytics } from '@teambit/legacy/dist/analytics/analytics';
import { BitId, BitIds } from '@teambit/legacy/dist/bit-id';
import { POST_TAG_ALL_HOOK, POST_TAG_HOOK, PRE_TAG_ALL_HOOK, PRE_TAG_HOOK } from '@teambit/legacy/dist/constants';
import { Consumer } from '@teambit/legacy/dist/consumer';
import ComponentsList from '@teambit/legacy/dist/consumer/component/components-list';
import HooksManager from '@teambit/legacy/dist/hooks';
import { TagParams, TagResults } from '@teambit/legacy/dist/api/consumer/lib/tag';
import hasWildcard from '@teambit/legacy/dist/utils/string/has-wildcard';
import { validateVersion } from '@teambit/legacy/dist/utils/semver-helper';
import { ConsumerNotFound } from '@teambit/legacy/dist/consumer/exceptions';
import loader from '@teambit/legacy/dist/cli/loader';
import { LanesIsDisabled } from '@teambit/legacy/dist/consumer/lanes/exceptions/lanes-is-disabled';
import { SnapResults } from '@teambit/legacy/dist/api/consumer/lib/snap';
import { SnapCmd } from './snap-cmd';
import { SnappingAspect } from './snapping.aspect';
import { TagCmd } from './tag-cmd';

const HooksManagerInstance = HooksManager.getInstance();

export class SnappingMain {
  constructor(private workspace: Workspace) {}

  async tag(tagParams: TagParams): Promise<TagResults | null> {
    if (!this.workspace) throw new ConsumerNotFound();
    const { ids, all, exactVersion, releaseType, force, ignoreIssues, scope, includeImported, persist, snapped } =
      tagParams;
    const idsHasWildcard = hasWildcard(ids);
    const isAll = Boolean(all || scope || idsHasWildcard);
    const validExactVersion = validateVersion(exactVersion);
    const preHook = isAll ? PRE_TAG_ALL_HOOK : PRE_TAG_HOOK;
    HooksManagerInstance.triggerHook(preHook, tagParams);
    const consumer = this.workspace.consumer;
    const componentsList = new ComponentsList(consumer);
    loader.start('determine components to tag...');
    const newComponents = await componentsList.listNewComponents();
    const { bitIds, warnings } = await this.getComponentsToTag(
      consumer,
      Boolean(scope),
      exactVersion,
      includeImported,
      persist,
      force,
      ids,
      snapped
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

  async snap(args: {
    id: string;
    message: string;
    force: boolean;
    verbose: boolean;
    ignoreIssues?: string;
    build: boolean;
    skipTests: boolean;
    skipAutoSnap: boolean;
    disableTagAndSnapPipelines: boolean;
    forceDeploy: boolean;
  }): Promise<SnapResults | null> {
    if (!this.workspace) throw new ConsumerNotFound();
    const {
      id,
      message,
      force,
      verbose,
      ignoreIssues,
      skipTests,
      skipAutoSnap,
      build,
      disableTagAndSnapPipelines,
      forceDeploy,
    } = args;
    const consumer: Consumer = this.workspace.consumer;
    if (consumer.isLegacy) throw new LanesIsDisabled();
    const componentsList = new ComponentsList(consumer);
    const newComponents = (await componentsList.listNewComponents()) as BitIds;
    const ids = await getIdsToSnap();
    if (!ids) return null;
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const snapResults: SnapResults = await consumer.snap({
      ids,
      ignoreIssues,
      message,
      force,
      build,
      skipTests,
      verbose,
      skipAutoSnap,
      disableTagAndSnapPipelines,
      forceDeploy,
    });

    snapResults.newComponents = newComponents;
    const currentLane = consumer.getCurrentLaneId();
    snapResults.laneName = currentLane.isDefault() ? null : currentLane.name;
    await consumer.onDestroy();
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return snapResults;

    async function getIdsToSnap(): Promise<BitIds> {
      const idHasWildcard = id && hasWildcard(id);
      if (id && !idHasWildcard) {
        const bitId = consumer.getParsedId(id);
        if (!force) {
          const componentStatus = await consumer.getComponentStatusById(bitId);
          // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
          if (componentStatus.modified === false) return null;
        }
        return new BitIds(bitId);
      }
      const tagPendingComponents = await componentsList.listTagPendingComponents();
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      if (R.isEmpty(tagPendingComponents)) return null;
      return idHasWildcard ? ComponentsList.filterComponentsByWildcard(tagPendingComponents, id) : tagPendingComponents;
    }
  }

  private async getComponentsToTag(
    consumer: Consumer,
    isAllScope: boolean,
    exactVersion: string | undefined,
    includeImported: boolean,
    persist: boolean,
    force: boolean,
    ids: string[],
    snapped: boolean
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

    const snappedComponents = await componentsList.listSnappedComponentsOnMain();
    const snappedComponentsIds = snappedComponents.map((c) => c.toBitId());

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

    if (snapped) {
      return { bitIds: snappedComponentsIds, warnings };
    }

    tagPendingComponents.push(...snappedComponentsIds);

    if (isAllScope && exactVersion) {
      const tagPendingComponentsLatest = await consumer.scope.latestVersions(tagPendingComponents, false);
      tagPendingComponentsLatest.forEach((componentId) => {
        if (componentId.version && semver.valid(componentId.version) && semver.gt(componentId.version, exactVersion)) {
          warnings.push(`warning: ${componentId.toString()} has a version greater than ${exactVersion}`);
        }
      });
    }

    return { bitIds: tagPendingComponents.map((id) => id.changeVersion(undefined)), warnings };
  }

  static slots = [];
  static dependencies = [WorkspaceAspect, CLIAspect, CommunityAspect];
  static runtime = MainRuntime;
  static async provider([workspace, cli, community]: [Workspace, CLIMain, CommunityMain]) {
    const snapping = new SnappingMain(workspace);
    const snapCmd = new SnapCmd(community.getBaseDomain(), snapping);
    const tagCmd = new TagCmd(community.getBaseDomain(), snapping);
    cli.register(tagCmd, snapCmd);
    return snapping;
  }
}

SnappingAspect.addRuntime(SnappingMain);
