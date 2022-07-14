import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { isFeatureEnabled, BUILD_ON_CI } from '@teambit/legacy/dist/api/consumer/lib/feature-toggle';
import { IssuesClasses } from '@teambit/component-issues';
import CommunityAspect, { CommunityMain } from '@teambit/community';
import WorkspaceAspect, { Workspace } from '@teambit/workspace';
import R from 'ramda';
import semver, { ReleaseType } from 'semver';
import { compact } from 'lodash';
import { Analytics } from '@teambit/legacy/dist/analytics/analytics';
import { BitId, BitIds } from '@teambit/legacy/dist/bit-id';
import { POST_TAG_ALL_HOOK, POST_TAG_HOOK } from '@teambit/legacy/dist/constants';
import { Consumer } from '@teambit/legacy/dist/consumer';
import ComponentsList from '@teambit/legacy/dist/consumer/component/components-list';
import HooksManager from '@teambit/legacy/dist/hooks';
import pMapSeries from 'p-map-series';
import { TagResults, BasicTagParams } from '@teambit/legacy/dist/api/consumer/lib/tag';
import hasWildcard from '@teambit/legacy/dist/utils/string/has-wildcard';
import { validateVersion } from '@teambit/legacy/dist/utils/semver-helper';
import { ConsumerNotFound } from '@teambit/legacy/dist/consumer/exceptions';
import loader from '@teambit/legacy/dist/cli/loader';
import tagModelComponent from '@teambit/legacy/dist/scope/component-ops/tag-model-component';
import { SnapResults } from '@teambit/legacy/dist/api/consumer/lib/snap';
import ComponentsPendingImport from '@teambit/legacy/dist/consumer/component-ops/exceptions/components-pending-import';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import { BitError } from '@teambit/bit-error';
import ConsumerComponent from '@teambit/legacy/dist/consumer/component/consumer-component';
import ComponentMap from '@teambit/legacy/dist/consumer/bit-map/component-map';
import pMap from 'p-map';
import { InsightsAspect, InsightsMain } from '@teambit/insights';
import { concurrentComponentsLimit } from '@teambit/legacy/dist/utils/concurrency';
import {
  removeLocalVersionsForAllComponents,
  untagResult,
  getComponentsWithOptionToUntag,
  removeLocalVersionsForMultipleComponents,
} from '@teambit/legacy/dist/scope/component-ops/untag-component';
import { ModelComponent } from '@teambit/legacy/dist/scope/models';
import IssuesAspect, { IssuesMain } from '@teambit/issues';
import { SnapCmd } from './snap-cmd';
import { SnappingAspect } from './snapping.aspect';
import { TagCmd } from './tag-cmd';
import { ComponentsHaveIssues } from './components-have-issues';
import ResetCmd from './reset-cmd';

const HooksManagerInstance = HooksManager.getInstance();

export class SnappingMain {
  constructor(
    private workspace: Workspace,
    private logger: Logger,
    private issues: IssuesMain,
    private insights: InsightsMain
  ) {}

  /**
   * tag the given component ids or all modified/new components if "all" param is set.
   * tag is a similar operation as a snap, which saves the changes into the local scope, but it also creates an alias
   * with a valid semver to that version.
   * tag can be done only on main, not on a lane.
   */
  // eslint-disable-next-line complexity
  async tag({
    ids = [],
    message = '',
    version,
    editor = '',
    snapped = false,
    releaseType,
    preReleaseId,
    ignoreIssues,
    ignoreNewestVersion = false,
    skipTests = false,
    skipAutoTag = false,
    build,
    unmodified = false,
    soft = false,
    persist = false,
    forceDeploy = false,
    incrementBy = 1,
    disableTagAndSnapPipelines = false,
  }: {
    ids?: string[];
    all?: boolean | string;
    snapped?: boolean;
    version?: string;
    releaseType?: ReleaseType;
    ignoreIssues?: string;
    scope?: string | boolean;
    incrementBy?: number;
  } & Partial<BasicTagParams>): Promise<TagResults | null> {
    build = isFeatureEnabled(BUILD_ON_CI) ? Boolean(build) : true;
    if (soft) build = false;
    if (disableTagAndSnapPipelines && forceDeploy) {
      throw new BitError('you can use either force-deploy or disable-tag-pipeline, but not both');
    }
    if (editor && persist) {
      throw new BitError('you can use either --editor or --persist, but not both');
    }
    if (editor && message) {
      throw new BitError('you can use either --editor or --message, but not both');
    }

    const exactVersion = version;
    if (!this.workspace) throw new ConsumerNotFound();
    const idsHasWildcard = hasWildcard(ids);
    const isAll = Boolean(!ids.length || idsHasWildcard);
    const validExactVersion = validateVersion(exactVersion);
    const consumer = this.workspace.consumer;
    const componentsList = new ComponentsList(consumer);
    loader.start('determine components to tag...');
    const newComponents = await componentsList.listNewComponents();
    const { bitIds, warnings } = await this.getComponentsToTag(unmodified, exactVersion, persist, ids, snapped);
    if (R.isEmpty(bitIds)) return null;

    const legacyBitIds = BitIds.fromArray(bitIds);

    this.logger.debug(`tagging the following components: ${legacyBitIds.toString()}`);
    Analytics.addBreadCrumb('tag', `tagging the following components: ${Analytics.hashData(legacyBitIds)}`);
    if (!soft) {
      await this.workspace.consumer.componentFsCache.deleteAllDependenciesDataCache();
    }
    const components = await this.loadComponentsForTag(legacyBitIds);
    await this.throwForLegacyDependenciesInsideHarmony(components);
    await this.throwForComponentIssues(components, ignoreIssues);
    const areComponentsMissingFromScope = components.some((c) => !c.componentFromModel && c.id.hasScope());
    if (areComponentsMissingFromScope) {
      throw new ComponentsPendingImport();
    }

    const { taggedComponents, autoTaggedResults, publishedPackages } = await tagModelComponent({
      consumerComponents: components,
      ids: legacyBitIds,
      scope: this.workspace.scope.legacyScope,
      message,
      editor,
      exactVersion: validExactVersion,
      releaseType,
      preReleaseId,
      consumer: this.workspace.consumer,
      ignoreNewestVersion,
      skipTests,
      skipAutoTag,
      soft,
      build,
      persist,
      resolveUnmerged: false,
      disableTagAndSnapPipelines,
      forceDeploy,
      incrementBy,
      packageManagerConfigRootDir: this.workspace.path,
    });

    const tagResults = { taggedComponents, autoTaggedResults, isSoftTag: soft, publishedPackages };
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    tagResults.warnings = warnings;

    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    tagResults.newComponents = newComponents;
    const postHook = isAll ? POST_TAG_ALL_HOOK : POST_TAG_HOOK;
    HooksManagerInstance?.triggerHook(postHook, tagResults);
    Analytics.setExtraData(
      'num_components',
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      R.concat(tagResults.taggedComponents, tagResults.autoTaggedResults, tagResults.newComponents).length
    );
    await consumer.onDestroy();
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return tagResults;
  }

  /**
   * save the local changes of a component(s) into the scope. snap can be done on main or on a lane.
   * once a component is snapped on a lane, it becomes part of it.
   */
  async snap({
    pattern,
    legacyBitIds, // @todo: change to ComponentID[]. pass only if have the ids already parsed.
    resolveUnmerged = false,
    message = '',
    ignoreIssues,
    skipTests = false,
    skipAutoSnap = false,
    build,
    disableTagAndSnapPipelines = false,
    forceDeploy = false,
    unmodified = false,
  }: {
    pattern?: string;
    legacyBitIds?: BitIds;
    resolveUnmerged?: boolean;
    message?: string;
    ignoreIssues?: string;
    build: boolean;
    skipTests?: boolean;
    skipAutoSnap?: boolean;
    disableTagAndSnapPipelines?: boolean;
    forceDeploy?: boolean;
    unmodified?: boolean;
  }): Promise<SnapResults | null> {
    if (!this.workspace) throw new ConsumerNotFound();
    if (pattern && legacyBitIds) throw new Error(`please pass either pattern or legacyBitIds, not both`);
    const consumer: Consumer = this.workspace.consumer;
    const componentsList = new ComponentsList(consumer);
    const newComponents = (await componentsList.listNewComponents()) as BitIds;
    const ids = legacyBitIds || (await getIdsToSnap(this.workspace));
    if (!ids) return null;
    this.logger.debug(`snapping the following components: ${ids.toString()}`);
    await this.workspace.consumer.componentFsCache.deleteAllDependenciesDataCache();
    const components = await this.loadComponentsForTag(ids);
    await this.throwForLegacyDependenciesInsideHarmony(components);
    await this.throwForComponentIssues(components, ignoreIssues);
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
      consumer: this.workspace.consumer,
      skipTests,
      skipAutoTag: skipAutoSnap,
      persist: true,
      soft: false,
      build,
      resolveUnmerged,
      isSnap: true,
      disableTagAndSnapPipelines,
      forceDeploy,
      packageManagerConfigRootDir: this.workspace.path,
    });
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const snapResults: SnapResults = { snappedComponents: taggedComponents, autoSnappedResults: autoTaggedResults };

    snapResults.newComponents = newComponents;
    const currentLane = consumer.getCurrentLaneId();
    snapResults.laneName = currentLane.isDefault() ? null : currentLane.name;
    await consumer.onDestroy();
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return snapResults;

    async function getIdsToSnap(workspace: Workspace): Promise<BitIds | null> {
      const tagPendingComponents = unmodified
        ? await componentsList.listPotentialTagAllWorkspace()
        : await componentsList.listTagPendingComponents();
      if (R.isEmpty(tagPendingComponents)) return null;
      const tagPendingComponentsIds = await workspace.resolveMultipleComponentIds(tagPendingComponents);
      // when unmodified, we ask for all components, throw if no matching. if not unmodified and no matching, see error
      // below, suggesting to use --unmodified flag.
      const shouldThrowForNoMatching = unmodified;
      const getCompIds = async () => {
        if (!pattern) return tagPendingComponentsIds;
        if (!pattern.includes('*') && !pattern.includes(',')) {
          const compId = await workspace.resolveComponentId(pattern);
          return [compId];
        }
        return workspace.scope.filterIdsFromPoolIdsByPattern(
          pattern,
          tagPendingComponentsIds,
          shouldThrowForNoMatching
        );
      };
      const componentIds = await getCompIds();
      if (!componentIds.length && pattern) {
        const allTagPending = await componentsList.listPotentialTagAllWorkspace();
        if (allTagPending.length) {
          throw new BitError(`unable to find matching for "${pattern}" pattern among modified/new components.
there are matching among unmodified components thought. consider using --unmodified flag if needed`);
        }
      }
      if (!componentIds.length) {
        return null;
      }
      return BitIds.fromArray(componentIds.map((c) => c._legacy));
    }
  }

  /**
   * remove tags/snaps that exist locally, which were not exported yet.
   * once a tag/snap is exported, it's impossible to delete it as other components may depend on it
   */
  async reset(
    componentPattern?: string,
    version?: string,
    force = false,
    soft = false
  ): Promise<{ results: untagResult[]; isSoftUntag: boolean }> {
    if (!this.workspace) throw new ConsumerNotFound();
    const consumer = this.workspace.consumer;
    const currentLane = await consumer.getCurrentLaneObject();
    const untag = async (): Promise<untagResult[]> => {
      if (!componentPattern) {
        return removeLocalVersionsForAllComponents(consumer, currentLane, version, force);
      }
      const candidateComponents = await getComponentsWithOptionToUntag(consumer, version);
      const idsMatchingPattern = await this.workspace.idsByPattern(componentPattern);
      const idsMatchingPatternBitIds = BitIds.fromArray(idsMatchingPattern.map((id) => id._legacy));
      const componentsToUntag = candidateComponents.filter((modelComponent) =>
        idsMatchingPatternBitIds.hasWithoutVersion(modelComponent.toBitId())
      );
      return removeLocalVersionsForMultipleComponents(componentsToUntag, currentLane, version, force, consumer.scope);
    };
    const softUntag = async () => {
      const componentsList = new ComponentsList(consumer);
      const softTaggedComponents = componentsList.listSoftTaggedComponents();
      const softTaggedComponentsIds = await this.workspace.resolveMultipleComponentIds(softTaggedComponents);
      const idsToRemoveSoftTags = componentPattern
        ? this.workspace.scope.filterIdsFromPoolIdsByPattern(componentPattern, softTaggedComponentsIds)
        : softTaggedComponentsIds;
      return compact(
        idsToRemoveSoftTags.map((componentId) => {
          const componentMap = consumer.bitMap.getComponent(componentId._legacy, { ignoreScopeAndVersion: true });
          const removedVersion = componentMap.nextVersion?.version;
          if (!removedVersion) return null;
          componentMap.clearNextVersion();
          return { id: componentId._legacy, versions: [removedVersion] };
        })
      );
    };
    let results: untagResult[];
    const isRealUntag = !soft;
    if (isRealUntag) {
      results = await untag();
      await consumer.scope.objects.persist();
      const components = results.map((result) => result.component);
      await consumer.updateComponentsVersions(components as ModelComponent[]);
    } else {
      results = await softUntag();
      consumer.bitMap.markAsChanged();
    }

    await consumer.onDestroy();
    return { results, isSoftUntag: !isRealUntag };
  }

  private async loadComponentsForTag(ids: BitIds): Promise<ConsumerComponent[]> {
    const { components } = await this.workspace.consumer.loadComponents(ids.toVersionLatest());
    components.forEach((component) => {
      const componentMap = component.componentMap as ComponentMap;
      if (!componentMap.rootDir) {
        throw new Error(`unable to tag ${component.id.toString()}, the "rootDir" is missing in the .bitmap file`);
      }
    });
    return components;
  }

  private async throwForComponentIssues(legacyComponents: ConsumerComponent[], ignoreIssues?: string) {
    if (ignoreIssues === '*') {
      // ignore all issues
      return;
    }
    const issuesToIgnoreFromFlag = ignoreIssues?.split(',').map((issue) => issue.trim()) || [];
    const issuesToIgnoreFromConfig = this.issues.getIssuesToIgnoreGlobally();
    const issuesToIgnore = [...issuesToIgnoreFromFlag, ...issuesToIgnoreFromConfig];
    const components = await this.workspace.getManyByLegacy(legacyComponents);
    if (!issuesToIgnore.includes(IssuesClasses.CircularDependencies.name)) {
      await this.insights.addInsightsAsComponentIssues(components);
    }
    this.issues.removeIgnoredIssuesFromComponents(components);

    const componentsWithBlockingIssues = legacyComponents.filter((component) => component.issues?.shouldBlockTagging());
    if (!R.isEmpty(componentsWithBlockingIssues)) {
      throw new ComponentsHaveIssues(componentsWithBlockingIssues);
    }
  }

  private async throwForLegacyDependenciesInsideHarmony(components: ConsumerComponent[]) {
    const throwForComponent = async (component: ConsumerComponent) => {
      const dependenciesIds = component.getAllDependenciesIds();
      const legacyScope = this.workspace.scope.legacyScope;
      await Promise.all(
        dependenciesIds.map(async (depId) => {
          if (!depId.hasVersion()) return;
          const modelComp = await legacyScope.getModelComponentIfExist(depId);
          if (!modelComp) return;
          const version = await modelComp.loadVersion(depId.version as string, legacyScope.objects);
          if (version.isLegacy) {
            throw new Error(
              `unable tagging "${component.id.toString()}", its dependency "${depId.toString()}" is legacy`
            );
          }
        })
      );
    };
    await pMap(components, (component) => throwForComponent(component), { concurrency: concurrentComponentsLimit() });
  }

  private async getComponentsToTag(
    includeUnmodified: boolean,
    exactVersion: string | undefined,
    persist: boolean,
    ids: string[],
    snapped: boolean
  ): Promise<{ bitIds: BitId[]; warnings: string[] }> {
    const warnings: string[] = [];
    const componentsList = new ComponentsList(this.workspace.consumer);
    if (persist) {
      const softTaggedComponents = componentsList.listSoftTaggedComponents();
      return { bitIds: softTaggedComponents, warnings: [] };
    }

    const tagPendingBitIds = includeUnmodified
      ? await componentsList.listPotentialTagAllWorkspace()
      : await componentsList.listTagPendingComponents();

    const tagPendingComponentsIds = await this.workspace.resolveMultipleComponentIds(tagPendingBitIds);

    const snappedComponents = await componentsList.listSnappedComponentsOnMain();
    const snappedComponentsIds = snappedComponents.map((c) => c.toBitId());

    if (ids.length) {
      const componentIds = await pMapSeries(ids, async (id) => {
        const [idWithoutVer, version] = id.split('@');
        const idHasWildcard = hasWildcard(id);
        if (idHasWildcard) {
          const allIds = this.workspace.scope.filterIdsFromPoolIdsByPattern(idWithoutVer, tagPendingComponentsIds);
          return allIds.map((componentId) => componentId.changeVersion(version));
        }
        const componentId = await this.workspace.resolveComponentId(idWithoutVer);
        if (!includeUnmodified) {
          const componentStatus = await this.workspace.consumer.getComponentStatusById(componentId._legacy);
          if (componentStatus.modified === false) return null;
        }
        return componentId.changeVersion(version);
      });

      return { bitIds: compact(componentIds.flat()).map((bitId) => bitId._legacy), warnings };
    }

    if (snapped) {
      return { bitIds: snappedComponentsIds, warnings };
    }

    tagPendingBitIds.push(...snappedComponentsIds);

    if (includeUnmodified && exactVersion) {
      const tagPendingComponentsLatest = await this.workspace.scope.legacyScope.latestVersions(tagPendingBitIds, false);
      tagPendingComponentsLatest.forEach((componentId) => {
        if (componentId.version && semver.valid(componentId.version) && semver.gt(componentId.version, exactVersion)) {
          warnings.push(`warning: ${componentId.toString()} has a version greater than ${exactVersion}`);
        }
      });
    }

    return { bitIds: tagPendingBitIds.map((id) => id.changeVersion(undefined)), warnings };
  }

  static slots = [];
  static dependencies = [WorkspaceAspect, CLIAspect, CommunityAspect, LoggerAspect, IssuesAspect, InsightsAspect];
  static runtime = MainRuntime;
  static async provider([workspace, cli, community, loggerMain, issues, insights]: [
    Workspace,
    CLIMain,
    CommunityMain,
    LoggerMain,
    IssuesMain,
    InsightsMain
  ]) {
    const logger = loggerMain.createLogger(SnappingAspect.id);
    const snapping = new SnappingMain(workspace, logger, issues, insights);
    const snapCmd = new SnapCmd(community.getBaseDomain(), snapping, logger);
    const tagCmd = new TagCmd(community.getBaseDomain(), snapping, logger);
    const resetCmd = new ResetCmd(snapping);
    cli.register(tagCmd, snapCmd, resetCmd);
    return snapping;
  }
}

SnappingAspect.addRuntime(SnappingMain);

export default SnappingMain;
