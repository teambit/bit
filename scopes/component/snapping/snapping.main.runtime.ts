import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { IssuesClasses } from '@teambit/component-issues';
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
import { ConsumerNotFound, ComponentsHaveIssues } from '@teambit/legacy/dist/consumer/exceptions';
import loader from '@teambit/legacy/dist/cli/loader';
import tagModelComponent from '@teambit/legacy/dist/scope/component-ops/tag-model-component';
import { LanesIsDisabled } from '@teambit/legacy/dist/consumer/lanes/exceptions/lanes-is-disabled';
import { SnapResults } from '@teambit/legacy/dist/api/consumer/lib/snap';
import ComponentsPendingImport from '@teambit/legacy/dist/consumer/component-ops/exceptions/components-pending-import';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import Component from '@teambit/legacy/dist/consumer/component/consumer-component';
import ComponentMap from '@teambit/legacy/dist/consumer/bit-map/component-map';
import { FailedLoadForTag } from '@teambit/legacy/dist/consumer/component/exceptions/failed-load-for-tag';
import { SnapCmd } from './snap-cmd';
import { SnappingAspect } from './snapping.aspect';
import { TagCmd } from './tag-cmd';

const HooksManagerInstance = HooksManager.getInstance();

export class SnappingMain {
  constructor(private workspace: Workspace, private logger: Logger) {}

  async tag(tagParams: TagParams): Promise<TagResults | null> {
    if (!this.workspace) throw new ConsumerNotFound();
    const { ids, all, exactVersion, force, scope, includeImported, persist, snapped, soft } = tagParams;
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
      Boolean(scope),
      exactVersion,
      includeImported,
      persist,
      force,
      ids,
      snapped
    );
    if (R.isEmpty(bitIds)) return null;

    const legacyBitIds = BitIds.fromArray(bitIds);

    if (this.workspace.isLegacy) {
      tagParams.persist = true;
    }
    this.logger.debug(`tagging the following components: ${legacyBitIds.toString()}`);
    Analytics.addBreadCrumb('tag', `tagging the following components: ${Analytics.hashData(legacyBitIds)}`);
    if (!soft) {
      await this.workspace.consumer.componentFsCache.deleteAllDependenciesDataCache();
    }
    const components = await this.loadComponentsForTag(legacyBitIds);
    this.throwForComponentIssues(components, tagParams.ignoreIssues);
    const areComponentsMissingFromScope = components.some((c) => !c.componentFromModel && c.id.hasScope());
    if (areComponentsMissingFromScope) {
      throw new ComponentsPendingImport();
    }

    const { taggedComponents, autoTaggedResults, publishedPackages } = await tagModelComponent({
      ...tagParams,
      exactVersion: validExactVersion,
      ids: legacyBitIds,
      consumerComponents: components,
      scope: this.workspace.scope.legacyScope,
      consumer: this.workspace.consumer,
    });

    const tagResults = { taggedComponents, autoTaggedResults, isSoftTag: tagParams.soft, publishedPackages };

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
    this.logger.debug(`snapping the following components: ${ids.toString()}`);
    await this.workspace.consumer.componentFsCache.deleteAllDependenciesDataCache();
    const components = await this.loadComponentsForTag(ids);
    this.throwForComponentIssues(components, ignoreIssues);
    const areComponentsMissingFromScope = components.some((c) => !c.componentFromModel && c.id.hasScope());
    if (areComponentsMissingFromScope) {
      throw new ComponentsPendingImport();
    }

    const { taggedComponents, autoTaggedResults } = await tagModelComponent({
      consumerComponents: components,
      ids,
      ignoreNewestVersion: false,
      scope: this.workspace.scope.legacyScope,
      message,
      force,
      consumer: this.workspace.consumer,
      skipTests,
      verbose,
      skipAutoTag: skipAutoSnap,
      persist: true,
      soft: false,
      build,
      resolveUnmerged: false,
      isSnap: true,
      disableTagAndSnapPipelines,
      forceDeploy,
    });
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const snapResults: SnapResults = { snappedComponents: taggedComponents, autoSnappedResults: autoTaggedResults };

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

  private async loadComponentsForTag(ids: BitIds): Promise<Component[]> {
    const { components } = await this.workspace.consumer.loadComponents(ids.toVersionLatest());
    if (this.workspace.isLegacy) {
      return components;
    }
    let shouldReloadComponents = false;
    const componentsWithRelativePaths: string[] = [];
    const componentsWithFilesNotDir: string[] = [];
    const componentsWithCustomModuleResolution: string[] = [];
    components.forEach((component) => {
      const componentMap = component.componentMap as ComponentMap;
      if (componentMap.rootDir) return;
      const hasRelativePaths = component.issues?.getIssue(IssuesClasses.RelativeComponentsAuthored);
      const hasCustomModuleResolutions = component.issues?.getIssue(IssuesClasses.MissingCustomModuleResolutionLinks);
      // leaving this because it can be helpful for users upgrade from legacy
      if (componentMap.trackDir && !hasRelativePaths) {
        componentMap.changeRootDirAndUpdateFilesAccordingly(componentMap.trackDir);
        shouldReloadComponents = true;
        return;
      }
      if (hasRelativePaths) {
        componentsWithRelativePaths.push(component.id.toStringWithoutVersion());
      }
      if (!componentMap.trackDir) {
        componentsWithFilesNotDir.push(component.id.toStringWithoutVersion());
      }
      if (hasCustomModuleResolutions) {
        componentsWithCustomModuleResolution.push(component.id.toStringWithoutVersion());
      }
    });
    if (componentsWithRelativePaths.length || componentsWithFilesNotDir.length) {
      throw new FailedLoadForTag(
        componentsWithRelativePaths.sort(),
        componentsWithFilesNotDir.sort(),
        componentsWithCustomModuleResolution.sort()
      );
    }
    if (!shouldReloadComponents) return components;
    this.workspace.clearCache();
    const { components: reloadedComponents } = await this.workspace.consumer.loadComponents(ids);
    return reloadedComponents;
  }

  private throwForComponentIssues(components: Component[], ignoreIssues?: string) {
    components.forEach((component) => {
      if (this.workspace.isLegacy && component.issues) {
        component.issues.delete(IssuesClasses.RelativeComponentsAuthored);
      }
    });
    if (ignoreIssues === '*') {
      // ignore all issues
      return;
    }
    const issuesToIgnore = ignoreIssues?.split(',').map((issue) => issue.trim());
    issuesToIgnore?.forEach((issue) => {
      const issueClass = IssuesClasses[issue];
      if (!issueClass) {
        throw new Error(
          `unrecognized component-issue "${issue}". please specify one of the following:\n${Object.keys(
            IssuesClasses
          ).join('\n')}`
        );
      }
      components.forEach((component) => {
        component.issues.delete(issueClass);
      });
    });
    const componentsWithBlockingIssues = components.filter((component) => component.issues?.shouldBlockTagging());
    if (!R.isEmpty(componentsWithBlockingIssues)) {
      throw new ComponentsHaveIssues(componentsWithBlockingIssues);
    }
  }

  private async getComponentsToTag(
    isAllScope: boolean,
    exactVersion: string | undefined,
    includeImported: boolean,
    persist: boolean,
    force: boolean,
    ids: string[],
    snapped: boolean
  ): Promise<{ bitIds: BitId[]; warnings: string[] }> {
    const warnings: string[] = [];
    const componentsList = new ComponentsList(this.workspace.consumer);
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
          const bitId = this.workspace.consumer.getParsedId(idWithoutVer);
          if (!force) {
            const componentStatus = await this.workspace.consumer.getComponentStatusById(bitId);
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
      const tagPendingComponentsLatest = await this.workspace.scope.legacyScope.latestVersions(
        tagPendingComponents,
        false
      );
      tagPendingComponentsLatest.forEach((componentId) => {
        if (componentId.version && semver.valid(componentId.version) && semver.gt(componentId.version, exactVersion)) {
          warnings.push(`warning: ${componentId.toString()} has a version greater than ${exactVersion}`);
        }
      });
    }

    return { bitIds: tagPendingComponents.map((id) => id.changeVersion(undefined)), warnings };
  }

  static slots = [];
  static dependencies = [WorkspaceAspect, CLIAspect, CommunityAspect, LoggerAspect];
  static runtime = MainRuntime;
  static async provider([workspace, cli, community, loggerMain]: [Workspace, CLIMain, CommunityMain, LoggerMain]) {
    const logger = loggerMain.createLogger(SnappingAspect.id);
    const snapping = new SnappingMain(workspace, logger);
    const snapCmd = new SnapCmd(community.getBaseDomain(), snapping);
    const tagCmd = new TagCmd(community.getBaseDomain(), snapping);
    cli.register(tagCmd, snapCmd);
    return snapping;
  }
}

SnappingAspect.addRuntime(SnappingMain);
