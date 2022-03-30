import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { isString } from '@teambit/legacy/dist/utils';
import { isFeatureEnabled, BUILD_ON_CI } from '@teambit/legacy/dist/api/consumer/lib/feature-toggle';
import { IssuesClasses } from '@teambit/component-issues';
import CommunityAspect, { CommunityMain } from '@teambit/community';
import WorkspaceAspect, { Workspace } from '@teambit/workspace';
import R from 'ramda';
import semver, { ReleaseType } from 'semver';
import { compact } from 'lodash';
import { Analytics } from '@teambit/legacy/dist/analytics/analytics';
import { BitId, BitIds } from '@teambit/legacy/dist/bit-id';
import { POST_TAG_ALL_HOOK, POST_TAG_HOOK, DEFAULT_BIT_RELEASE_TYPE } from '@teambit/legacy/dist/constants';
import { Consumer } from '@teambit/legacy/dist/consumer';
import ComponentsList from '@teambit/legacy/dist/consumer/component/components-list';
import HooksManager from '@teambit/legacy/dist/hooks';
import { TagResults, BasicTagParams } from '@teambit/legacy/dist/api/consumer/lib/tag';
import hasWildcard from '@teambit/legacy/dist/utils/string/has-wildcard';
import { validateVersion } from '@teambit/legacy/dist/utils/semver-helper';
import { ConsumerNotFound } from '@teambit/legacy/dist/consumer/exceptions';
import loader from '@teambit/legacy/dist/cli/loader';
import tagModelComponent from '@teambit/legacy/dist/scope/component-ops/tag-model-component';
import { LanesIsDisabled } from '@teambit/legacy/dist/consumer/lanes/exceptions/lanes-is-disabled';
import { SnapResults } from '@teambit/legacy/dist/api/consumer/lib/snap';
import ComponentsPendingImport from '@teambit/legacy/dist/consumer/component-ops/exceptions/components-pending-import';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import { BitError } from '@teambit/bit-error';
import ConsumerComponent from '@teambit/legacy/dist/consumer/component/consumer-component';
import ComponentMap from '@teambit/legacy/dist/consumer/bit-map/component-map';
import pMap from 'p-map';
import { InsightsAspect, InsightsMain } from '@teambit/insights';
import { concurrentComponentsLimit } from '@teambit/legacy/dist/utils/concurrency';
import { FailedLoadForTag } from '@teambit/legacy/dist/consumer/component/exceptions/failed-load-for-tag';
import IssuesAspect, { IssuesMain } from '@teambit/issues';
import { SnapCmd } from './snap-cmd';
import { SnappingAspect } from './snapping.aspect';
import { TagCmd } from './tag-cmd';
import { ComponentsHaveIssues } from './components-have-issues';

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
    ver,
    all = false,
    editor = '',
    snapped = false,
    patch,
    minor,
    major,
    preRelease,
    force = false,
    verbose = false,
    ignoreIssues,
    ignoreNewestVersion = false,
    skipTests = false,
    skipAutoTag = false,
    scope,
    build,
    soft = false,
    persist = false,
    forceDeploy = false,
    incrementBy = 1,
    disableTagAndSnapPipelines = false,
  }: {
    ids?: string[];
    all?: boolean | string;
    snapped?: boolean | string;
    ver?: string;
    patch?: boolean;
    minor?: boolean;
    major?: boolean;
    ignoreIssues?: string;
    scope?: string | boolean;
    incrementBy?: number;
  } & Partial<BasicTagParams>): Promise<TagResults | null> {
    build = isFeatureEnabled(BUILD_ON_CI) ? Boolean(build) : true;
    if (soft) build = false;
    function getVersion(): string | undefined {
      if (scope && isString(scope)) return scope;
      if (all && isString(all)) return all;
      if (snapped && isString(snapped)) return snapped;
      return ver;
    }

    if (!ids.length && !all && !snapped && !scope && !persist) {
      throw new BitError('missing [id]. to tag all components, please use --all flag');
    }
    if (ids.length && all) {
      throw new BitError(
        'you can use either a specific component [id] to tag a particular component or --all flag to tag them all'
      );
    }
    if (disableTagAndSnapPipelines && forceDeploy) {
      throw new BitError('you can use either force-deploy or disable-tag-pipeline, but not both');
    }
    if (all && persist) {
      throw new BitError('you can use either --all or --persist, but not both');
    }
    if (editor && persist) {
      throw new BitError('you can use either --editor or --persist, but not both');
    }
    if (editor && message) {
      throw new BitError('you can use either --editor or --message, but not both');
    }

    const releaseFlags = [patch, minor, major, preRelease].filter((x) => x);
    if (releaseFlags.length > 1) {
      throw new BitError('you can use only one of the following - patch, minor, major, pre-release');
    }

    let releaseType: ReleaseType = DEFAULT_BIT_RELEASE_TYPE;
    const includeImported = Boolean(scope && all);

    if (major) releaseType = 'major';
    else if (minor) releaseType = 'minor';
    else if (patch) releaseType = 'patch';
    else if (preRelease) releaseType = 'prerelease';

    const exactVersion = getVersion();
    all = Boolean(all);
    snapped = Boolean(snapped);
    preRelease = typeof preRelease === 'string' ? preRelease : '';

    if (!this.workspace) throw new ConsumerNotFound();
    const idsHasWildcard = hasWildcard(ids);
    const isAll = Boolean(all || scope || idsHasWildcard);
    const validExactVersion = validateVersion(exactVersion);
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
      persist = true;
    }
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
      preRelease,
      force,
      consumer: this.workspace.consumer,
      ignoreNewestVersion,
      skipTests,
      verbose,
      skipAutoTag,
      soft,
      build,
      persist,
      resolveUnmerged: false,
      disableTagAndSnapPipelines,
      forceDeploy,
      incrementBy,
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
    id, // @todo: rename to "patterns"
    legacyBitIds, // @todo: change to ComponentID[]. pass only if have the ids already parsed.
    resolveUnmerged = false,
    message = '',
    force = false,
    verbose = false,
    ignoreIssues,
    skipTests = false,
    skipAutoSnap = false,
    build,
    disableTagAndSnapPipelines = false,
    forceDeploy = false,
  }: {
    id?: string;
    legacyBitIds?: BitIds;
    resolveUnmerged?: boolean;
    message?: string;
    force?: boolean;
    verbose?: boolean;
    ignoreIssues?: string;
    build: boolean;
    skipTests?: boolean;
    skipAutoSnap?: boolean;
    disableTagAndSnapPipelines?: boolean;
    forceDeploy?: boolean;
  }): Promise<SnapResults | null> {
    if (!this.workspace) throw new ConsumerNotFound();
    if (id && legacyBitIds) throw new Error(`please pass either id or legacyBitIds, not both`);
    const consumer: Consumer = this.workspace.consumer;
    if (consumer.isLegacy) throw new LanesIsDisabled();
    const componentsList = new ComponentsList(consumer);
    const newComponents = (await componentsList.listNewComponents()) as BitIds;
    const ids = legacyBitIds || (await getIdsToSnap());
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
      force,
      consumer: this.workspace.consumer,
      skipTests,
      verbose,
      skipAutoTag: skipAutoSnap,
      persist: true,
      soft: false,
      build,
      resolveUnmerged,
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

  private async loadComponentsForTag(ids: BitIds): Promise<ConsumerComponent[]> {
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

  private async throwForComponentIssues(legacyComponents: ConsumerComponent[], ignoreIssues?: string) {
    legacyComponents.forEach((component) => {
      if (this.workspace.isLegacy && component.issues) {
        component.issues.delete(IssuesClasses.RelativeComponentsAuthored);
      }
    });
    if (ignoreIssues === '*') {
      // ignore all issues
      return;
    }
    const issuesToIgnoreFromFlag = ignoreIssues?.split(',').map((issue) => issue.trim()) || [];
    const issuesToIgnoreFromConfig = this.issues.getIssuesToIgnore();
    const issuesToIgnore = [...issuesToIgnoreFromFlag, ...issuesToIgnoreFromConfig];
    if (!this.workspace.isLegacy && !issuesToIgnore.includes(IssuesClasses.CircularDependencies.name)) {
      const components = await this.workspace.getManyByLegacy(legacyComponents);
      await this.insights.addInsightsAsComponentIssues(components);
    }
    issuesToIgnore.forEach((issue) => {
      const issueClass = IssuesClasses[issue];
      if (!issueClass) {
        throw new Error(
          `unrecognized component-issue "${issue}". please specify one of the following:\n${Object.keys(
            IssuesClasses
          ).join('\n')}`
        );
      }
      legacyComponents.forEach((component) => {
        component.issues.delete(issueClass);
      });
    });
    const componentsWithBlockingIssues = legacyComponents.filter((component) => component.issues?.shouldBlockTagging());
    if (!R.isEmpty(componentsWithBlockingIssues)) {
      throw new ComponentsHaveIssues(componentsWithBlockingIssues);
    }
  }

  private async throwForLegacyDependenciesInsideHarmony(components: ConsumerComponent[]) {
    if (this.workspace.isLegacy) {
      return;
    }
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
    const snapCmd = new SnapCmd(community.getBaseDomain(), snapping);
    const tagCmd = new TagCmd(community.getBaseDomain(), snapping);
    cli.register(tagCmd, snapCmd);
    return snapping;
  }
}

SnappingAspect.addRuntime(SnappingMain);

export default SnappingMain;
