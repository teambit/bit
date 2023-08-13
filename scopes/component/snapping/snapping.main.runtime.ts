import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { Graph, Node, Edge } from '@teambit/graph.cleargraph';
import { LegacyOnTagResult } from '@teambit/legacy/dist/scope/scope';
import { FlattenedDependenciesGetter } from '@teambit/legacy/dist/scope/component-ops/get-flattened-dependencies';
import WorkspaceAspect, { OutsideWorkspaceError, Workspace } from '@teambit/workspace';
import R from 'ramda';
import semver, { ReleaseType } from 'semver';
import { compact, difference, uniq } from 'lodash';
import { Analytics } from '@teambit/legacy/dist/analytics/analytics';
import { BitId, BitIds } from '@teambit/legacy/dist/bit-id';
import { POST_TAG_ALL_HOOK, POST_TAG_HOOK, Extensions, LATEST, BuildStatus } from '@teambit/legacy/dist/constants';
import { Consumer } from '@teambit/legacy/dist/consumer';
import ComponentsList from '@teambit/legacy/dist/consumer/component/components-list';
import HooksManager from '@teambit/legacy/dist/hooks';
import pMapSeries from 'p-map-series';
import hasWildcard from '@teambit/legacy/dist/utils/string/has-wildcard';
import { validateVersion } from '@teambit/legacy/dist/utils/semver-helper';
import loader from '@teambit/legacy/dist/cli/loader';
import ComponentsPendingImport from '@teambit/legacy/dist/consumer/component-ops/exceptions/components-pending-import';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import { BitError } from '@teambit/bit-error';
import ConsumerComponent from '@teambit/legacy/dist/consumer/component/consumer-component';
import pMap from 'p-map';
import { InsightsAspect, InsightsMain } from '@teambit/insights';
import { concurrentComponentsLimit } from '@teambit/legacy/dist/utils/concurrency';
import {
  removeLocalVersionsForAllComponents,
  untagResult,
  getComponentsWithOptionToUntag,
  removeLocalVersionsForMultipleComponents,
} from '@teambit/legacy/dist/scope/component-ops/untag-component';
import { ScopeAspect, ScopeMain } from '@teambit/scope';
import { Lane, ModelComponent } from '@teambit/legacy/dist/scope/models';
import IssuesAspect, { IssuesMain } from '@teambit/issues';
import { Component } from '@teambit/component';
import { DependencyResolverAspect, DependencyResolverMain } from '@teambit/dependency-resolver';
import { ExtensionDataEntry } from '@teambit/legacy/dist/consumer/config';
import { BuilderAspect, BuilderMain } from '@teambit/builder';
import { LaneId } from '@teambit/lane-id';
import ImporterAspect, { ImporterMain } from '@teambit/importer';
import { ExportAspect, ExportMain } from '@teambit/export';
import UnmergedComponents from '@teambit/legacy/dist/scope/lanes/unmerged-components';
import { ComponentID } from '@teambit/component-id';
import { isHash, isTag } from '@teambit/component-version';
import { BitObject, Ref, Repository } from '@teambit/legacy/dist/scope/objects';
import {
  ArtifactFiles,
  ArtifactSource,
  getArtifactsFiles,
} from '@teambit/legacy/dist/consumer/component/sources/artifact-files';
import { VersionNotFound } from '@teambit/legacy/dist/scope/exceptions';
import { AutoTagResult } from '@teambit/legacy/dist/scope/component-ops/auto-tag';
import Version, { DepEdge, DepEdgeType, Log } from '@teambit/legacy/dist/scope/models/version';
import { SnapCmd } from './snap-cmd';
import { SnappingAspect } from './snapping.aspect';
import { TagCmd } from './tag-cmd';
import { ComponentsHaveIssues } from './components-have-issues';
import ResetCmd from './reset-cmd';
import { tagModelComponent, updateComponentsVersions, BasicTagParams } from './tag-model-component';
import { TagDataPerCompRaw, TagFromScopeCmd } from './tag-from-scope.cmd';
import { SnapDataPerCompRaw, SnapFromScopeCmd } from './snap-from-scope.cmd';

const HooksManagerInstance = HooksManager.getInstance();

export type TagDataPerComp = {
  componentId: ComponentID;
  dependencies: ComponentID[];
  versionToTag?: string; // must be set for tag. undefined for snap.
  prereleaseId?: string;
  message?: string;
};

export type SnapResults = BasicTagResults & {
  snappedComponents: ConsumerComponent[];
  autoSnappedResults: AutoTagResult[];
  laneName: string | null; // null if default
};

export type SnapFromScopeResults = {
  snappedIds: string[];
  exportedIds?: string[];
};

export type TagResults = BasicTagResults & {
  taggedComponents: ConsumerComponent[];
  autoTaggedResults: AutoTagResult[];
  isSoftTag: boolean;
  publishedPackages: string[];
};

export type BasicTagResults = {
  warnings: string[];
  newComponents: BitIds;
  removedComponents?: BitIds;
};

export class SnappingMain {
  private objectsRepo: Repository;
  constructor(
    private workspace: Workspace,
    private logger: Logger,
    private issues: IssuesMain,
    private insights: InsightsMain,
    private dependencyResolver: DependencyResolverMain,
    private scope: ScopeMain,
    private exporter: ExportMain,
    private builder: BuilderMain,
    private importer: ImporterMain
  ) {
    this.objectsRepo = this.scope?.legacyScope?.objects;
  }

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
    unmerged = false,
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
    ignoreBuildErrors = false,
    incrementBy = 1,
    disableTagAndSnapPipelines = false,
    failFast = false,
  }: {
    ids?: string[];
    all?: boolean | string;
    snapped?: boolean;
    unmerged?: boolean;
    version?: string;
    releaseType?: ReleaseType;
    ignoreIssues?: string;
    scope?: string | boolean;
    incrementBy?: number;
    failFast?: boolean;
  } & Partial<BasicTagParams>): Promise<TagResults | null> {
    if (soft) build = false;
    if (editor && persist) {
      throw new BitError('you can use either --editor or --persist, but not both');
    }
    if (editor && message) {
      throw new BitError('you can use either --editor or --message, but not both');
    }

    const exactVersion = version;
    if (!this.workspace) throw new OutsideWorkspaceError();
    const idsHasWildcard = hasWildcard(ids);
    const isAll = Boolean(!ids.length || idsHasWildcard);
    const validExactVersion = validateVersion(exactVersion);
    const consumer = this.workspace.consumer;
    const componentsList = new ComponentsList(consumer);
    loader.start('determine components to tag...');
    const newComponents = await componentsList.listNewComponents();
    const { bitIds, warnings } = await this.getComponentsToTag(
      unmodified,
      exactVersion,
      persist,
      ids,
      snapped,
      unmerged
    );
    if (R.isEmpty(bitIds)) return null;

    const legacyBitIds = BitIds.fromArray(bitIds);

    this.logger.debug(`tagging the following components: ${legacyBitIds.toString()}`);
    const components = await this.loadComponentsForTagOrSnap(legacyBitIds, !soft);
    const consumerComponents = components.map((c) => c.state._consumer) as ConsumerComponent[];
    await this.throwForLegacyDependenciesInsideHarmony(consumerComponents);
    await this.throwForComponentIssues(components, ignoreIssues);
    this.throwForPendingImport(consumerComponents);

    const { taggedComponents, autoTaggedResults, publishedPackages, stagedConfig, removedComponents } =
      await tagModelComponent({
        workspace: this.workspace,
        scope: this.scope,
        snapping: this,
        builder: this.builder,
        consumerComponents,
        ids: legacyBitIds,
        message,
        editor,
        exactVersion: validExactVersion,
        releaseType,
        preReleaseId,
        ignoreNewestVersion,
        skipTests,
        skipAutoTag,
        soft,
        build,
        persist,
        disableTagAndSnapPipelines,
        ignoreBuildErrors,
        incrementBy,
        packageManagerConfigRootDir: this.workspace.path,
        dependencyResolver: this.dependencyResolver,
        exitOnFirstFailedTask: failFast,
      });

    const tagResults = {
      taggedComponents,
      autoTaggedResults,
      isSoftTag: soft,
      publishedPackages,
      warnings,
      newComponents,
      removedComponents,
    };

    const postHook = isAll ? POST_TAG_ALL_HOOK : POST_TAG_HOOK;
    HooksManagerInstance?.triggerHook(postHook, tagResults);
    Analytics.setExtraData(
      'num_components',
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      R.concat(tagResults.taggedComponents, tagResults.autoTaggedResults, tagResults.newComponents).length
    );
    await consumer.onDestroy();
    await stagedConfig?.write();
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return tagResults;
  }

  async tagFromScope(
    tagDataPerCompRaw: TagDataPerCompRaw[],
    params: {
      push?: boolean;
      version?: string;
      releaseType?: ReleaseType;
      ignoreIssues?: string;
      incrementBy?: number;
    } & Partial<BasicTagParams>
  ): Promise<TagResults | null> {
    if (this.workspace) {
      throw new BitError(
        `unable to run this command from a workspace, please create a new bare-scope and run it from there`
      );
    }
    const tagDataPerComp = await Promise.all(
      tagDataPerCompRaw.map(async (tagData) => {
        return {
          componentId: await this.scope.resolveComponentId(tagData.componentId),
          dependencies: tagData.dependencies ? await this.scope.resolveMultipleComponentIds(tagData.dependencies) : [],
          versionToTag: tagData.versionToTag || params.releaseType || 'patch',
          prereleaseId: tagData.prereleaseId,
          message: tagData.message,
        };
      })
    );
    const componentIds = tagDataPerComp.map((t) => t.componentId);
    await this.scope.import(componentIds);
    const deps = compact(tagDataPerComp.map((t) => t.dependencies).flat()).map((dep) => dep.changeVersion(LATEST));
    const additionalComponentIdsToFetch = await Promise.all(
      componentIds.map(async (id) => {
        if (!id.hasVersion()) return null;
        const modelComp = await this.scope.getBitObjectModelComponent(id);
        if (!modelComp) throw new Error(`unable to find ModelComponent of ${id.toString()}`);
        if (!modelComp.head) return null;
        if (modelComp.getRef(id.version)?.isEqual(modelComp.head)) return null;
        if (!params.ignoreNewestVersion) {
          throw new BitError(`unable to tag "${id.toString()}", this version is older than the head ${modelComp.head.toString()}.
if you're willing to lose the history from the head to the specified version, use --ignore-newest-version flag`);
        }
        return id.changeVersion(LATEST);
      })
    );

    // import deps to be able to resolve semver
    await this.scope.import([...deps, ...compact(additionalComponentIdsToFetch)], { useCache: false });
    await Promise.all(
      tagDataPerComp.map(async (tagData) => {
        tagData.dependencies = tagData.dependencies
          ? await Promise.all(tagData.dependencies.map((d) => this.getCompIdWithExactVersionAccordingToSemver(d)))
          : [];
      })
    );
    const bitIds = componentIds.map((c) => c._legacy);
    const components = await this.scope.getMany(componentIds);
    await Promise.all(
      components.map(async (comp) => {
        const tagData = tagDataPerComp.find((t) => t.componentId.isEqual(comp.id, { ignoreVersion: true }));
        if (!tagData) throw new Error(`unable to find ${comp.id.toString()} in tagDataPerComp`);
        if (!tagData.dependencies.length) return;
        await this.updateDependenciesVersionsOfComponent(comp, tagData.dependencies, bitIds);
      })
    );

    await this.scope.loadManyCompsAspects(components);

    const consumerComponents = components.map((c) => c.state._consumer) as ConsumerComponent[];
    const shouldUsePopulateArtifactsFrom = components.every((comp) => {
      if (!comp.buildStatus) throw new Error(`tag-from-scope expect ${comp.id.toString()} to have buildStatus`);
      return comp.buildStatus === BuildStatus.Succeed;
    });
    const legacyIds = BitIds.fromArray(componentIds.map((id) => id._legacy));
    const results = await tagModelComponent({
      ...params,
      scope: this.scope,
      consumerComponents,
      tagDataPerComp,
      populateArtifactsFrom: shouldUsePopulateArtifactsFrom ? components.map((c) => c.id) : undefined,
      copyLogFromPreviousSnap: true,
      snapping: this,
      builder: this.builder,
      dependencyResolver: this.dependencyResolver,
      skipAutoTag: true,
      persist: true,
      ids: legacyIds,
      message: params.message as string,
    });

    const { taggedComponents, publishedPackages } = results;

    if (params.push) {
      await this.exporter.exportMany({
        scope: this.scope.legacyScope,
        ids: legacyIds,
        idsWithFutureScope: legacyIds,
        allVersions: false,
        exportOrigin: 'tag',
      });
    }

    return {
      taggedComponents,
      autoTaggedResults: [],
      isSoftTag: false,
      publishedPackages,
      warnings: [],
      newComponents: new BitIds(),
    };
  }

  async snapFromScope(
    snapDataPerCompRaw: SnapDataPerCompRaw[],
    params: {
      push?: boolean;
      ignoreIssues?: string;
      lane?: string;
    } & Partial<BasicTagParams>
  ): Promise<SnapFromScopeResults> {
    if (this.workspace) {
      throw new BitError(
        `unable to run this command from a workspace, please create a new bare-scope and run it from there`
      );
    }
    const snapDataPerComp = await Promise.all(
      snapDataPerCompRaw.map(async (snapData) => {
        return {
          componentId: await this.scope.resolveComponentId(snapData.componentId),
          dependencies: snapData.dependencies
            ? await this.scope.resolveMultipleComponentIds(snapData.dependencies)
            : [],
          aspects: snapData.aspects,
          message: snapData.message,
        };
      })
    );
    const componentIds = snapDataPerComp.map((t) => t.componentId);
    const bitIds = componentIds.map((c) => c._legacy);
    const componentIdsLatest = componentIds.map((id) => id.changeVersion(LATEST));

    let lane: Lane | undefined;
    const laneIdStr = params.lane;
    if (laneIdStr) {
      const laneId = LaneId.parse(laneIdStr);
      lane = await this.importer.importLaneObject(laneId);
      // this is critical. otherwise, later on, when loading aspects and isolating capsules, we'll try to fetch dists
      // from the original scope instead of the lane-scope.
      this.scope.legacyScope.setCurrentLaneId(laneId);
      this.scope.legacyScope.scopeImporter.shouldOnlyFetchFromCurrentLane = true;
    }

    await this.scope.import(componentIdsLatest, { lane });
    const components = await this.scope.getMany(componentIdsLatest);
    await Promise.all(
      components.map(async (comp) => {
        const snapData = snapDataPerComp.find((t) => {
          return t.componentId.isEqual(comp.id, { ignoreVersion: true });
        });
        if (!snapData) throw new Error(`unable to find ${comp.id.toString()} in snapDataPerComp`);
        if (snapData.aspects) await this.scope.addAspectsFromConfigObject(comp, snapData.aspects);
        if (snapData.dependencies.length) {
          await this.updateDependenciesVersionsOfComponent(comp, snapData.dependencies, bitIds);
        }
      })
    );
    const consumerComponents = components.map((c) => c.state._consumer);
    const legacyIds = BitIds.fromArray(componentIds.map((id) => id._legacy));
    const results = await tagModelComponent({
      ...params,
      scope: this.scope,
      consumerComponents,
      tagDataPerComp: snapDataPerComp,
      snapping: this,
      builder: this.builder,
      dependencyResolver: this.dependencyResolver,
      skipAutoTag: true,
      persist: true,
      isSnap: true,
      ids: legacyIds,
      message: params.message as string,
    });

    const { taggedComponents } = results;
    let exportedIds: string[] | undefined;
    if (params.push) {
      const updatedLane = lane ? await this.scope.legacyScope.loadLane(lane.toLaneId()) : undefined;
      const { exported } = await this.exporter.exportMany({
        scope: this.scope.legacyScope,
        ids: legacyIds,
        idsWithFutureScope: legacyIds,
        allVersions: false,
        laneObject: updatedLane || undefined,
        // no need other snaps. only the latest one. without this option, when snapping on lane from another-scope, it
        // may throw an error saying the previous snaps don't exist on the filesystem.
        // (see the e2e - "snap on a lane when the component is new to the lane and the scope")
        exportHeadsOnly: true,
      });
      exportedIds = exported.map((e) => e.toString());
    }

    return {
      snappedIds: taggedComponents.map((comp) => comp.id.toString()),
      exportedIds,
    };
  }

  /**
   * save the local changes of a component(s) into the scope. snap can be done on main or on a lane.
   * once a component is snapped on a lane, it becomes part of it.
   */
  async snap({
    pattern,
    legacyBitIds, // @todo: change to ComponentID[]. pass only if have the ids already parsed.
    unmerged,
    editor,
    message = '',
    ignoreIssues,
    skipTests = false,
    skipAutoSnap = false,
    build,
    disableTagAndSnapPipelines = false,
    ignoreBuildErrors = false,
    unmodified = false,
    exitOnFirstFailedTask = false,
  }: {
    pattern?: string;
    legacyBitIds?: BitIds;
    unmerged?: boolean;
    editor?: string;
    message?: string;
    ignoreIssues?: string;
    build: boolean;
    skipTests?: boolean;
    skipAutoSnap?: boolean;
    disableTagAndSnapPipelines?: boolean;
    ignoreBuildErrors?: boolean;
    unmodified?: boolean;
    exitOnFirstFailedTask?: boolean;
  }): Promise<SnapResults | null> {
    if (!this.workspace) throw new OutsideWorkspaceError();
    if (pattern && legacyBitIds) throw new Error(`please pass either pattern or legacyBitIds, not both`);
    const consumer: Consumer = this.workspace.consumer;
    const componentsList = new ComponentsList(consumer);
    const newComponents = (await componentsList.listNewComponents()) as BitIds;
    const ids = legacyBitIds || (await getIdsToSnap(this.workspace));
    if (!ids) return null;
    this.logger.debug(`snapping the following components: ${ids.toString()}`);
    const components = await this.loadComponentsForTagOrSnap(ids);
    const consumerComponents = components.map((c) => c.state._consumer) as ConsumerComponent[];
    await this.throwForLegacyDependenciesInsideHarmony(consumerComponents);
    await this.throwForComponentIssues(components, ignoreIssues);
    this.throwForPendingImport(consumerComponents);

    const { taggedComponents, autoTaggedResults, stagedConfig, removedComponents } = await tagModelComponent({
      workspace: this.workspace,
      scope: this.scope,
      snapping: this,
      builder: this.builder,
      editor,
      consumerComponents,
      ids,
      ignoreNewestVersion: false,
      message,
      skipTests,
      skipAutoTag: skipAutoSnap,
      persist: true,
      soft: false,
      build,
      isSnap: true,
      disableTagAndSnapPipelines,
      ignoreBuildErrors,
      packageManagerConfigRootDir: this.workspace.path,
      dependencyResolver: this.dependencyResolver,
      exitOnFirstFailedTask,
    });

    const snapResults: Partial<SnapResults> = {
      snappedComponents: taggedComponents,
      autoSnappedResults: autoTaggedResults,
      newComponents,
      removedComponents,
    };

    const currentLane = consumer.getCurrentLaneId();
    snapResults.laneName = currentLane.isDefault() ? null : currentLane.toString();
    await consumer.onDestroy();
    await stagedConfig?.write();
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return snapResults;

    async function getIdsToSnap(workspace: Workspace): Promise<BitIds | null> {
      if (unmerged) {
        return componentsList.listDuringMergeStateComponents();
      }
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
    head?: boolean,
    force = false,
    soft = false
  ): Promise<{ results: untagResult[]; isSoftUntag: boolean }> {
    if (!this.workspace) throw new OutsideWorkspaceError();
    const consumer = this.workspace.consumer;
    const currentLane = await consumer.getCurrentLaneObject();
    const untag = async (): Promise<untagResult[]> => {
      if (!componentPattern) {
        return removeLocalVersionsForAllComponents(consumer, currentLane, head);
      }
      const candidateComponents = await getComponentsWithOptionToUntag(consumer);
      const idsMatchingPattern = await this.workspace.idsByPattern(componentPattern);
      const idsMatchingPatternBitIds = BitIds.fromArray(idsMatchingPattern.map((id) => id._legacy));
      const componentsToUntag = candidateComponents.filter((modelComponent) =>
        idsMatchingPatternBitIds.hasWithoutVersion(modelComponent.toBitId())
      );
      return removeLocalVersionsForMultipleComponents(componentsToUntag, currentLane, head, force, consumer.scope);
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
      await updateComponentsVersions(this.workspace, components as ModelComponent[], false);
    } else {
      results = await softUntag();
      consumer.bitMap.markAsChanged();
    }

    await consumer.onDestroy();
    return { results, isSoftUntag: !isRealUntag };
  }

  async _addFlattenedDependenciesToComponents(components: ConsumerComponent[]) {
    loader.start('importing missing dependencies...');
    const getLane = async () => {
      const lane = await this.scope.legacyScope.getCurrentLaneObject();
      if (!lane) return undefined;
      if (!lane.isNew) return lane;
      const forkedFrom = lane.forkedFrom;
      if (!forkedFrom) return undefined;
      return this.scope.legacyScope.loadLane(forkedFrom);
    };
    const lane = await getLane();

    const flattenedDependenciesGetter = new FlattenedDependenciesGetter(
      this.scope.legacyScope,
      components,
      lane || undefined
    );
    await flattenedDependenciesGetter.populateFlattenedDependencies();
    loader.stop();
    await this._addFlattenedDepsGraphToComponents(components);
  }

  async throwForDepsFromAnotherLane(components: ConsumerComponent[]) {
    const lane = await this.scope.legacyScope.getCurrentLaneObject();
    const allIds = BitIds.fromArray(components.map((c) => c.id));
    const missingDeps = await pMapSeries(components, async (component) => {
      return this.throwForDepsFromAnotherLaneForComp(component, allIds, lane || undefined);
    });
    const flattenedMissingDeps = BitIds.uniqFromArray(missingDeps.flat().map((id) => id.changeVersion(undefined)));
    if (!flattenedMissingDeps.length) return;
    // ignore the cache. even if the component exists locally, we still need its VersionHistory object
    // in order to traverse the history and determine whether it's part of the lane history.
    await this.scope.legacyScope.scopeImporter.importWithoutDeps(flattenedMissingDeps, {
      cache: false,
      ignoreMissingHead: true,
      includeVersionHistory: true,
      lane: lane || undefined,
    });
    await pMapSeries(components, async (component) => {
      await this.throwForDepsFromAnotherLaneForComp(component, allIds, lane || undefined, true);
    });
  }
  private async throwForDepsFromAnotherLaneForComp(
    component: ConsumerComponent,
    allIds: BitIds,
    lane?: Lane,
    throwForMissingObjects = false
  ) {
    const deps = component.getAllDependencies();
    const missingDeps: BitId[] = [];
    await Promise.all(
      deps.map(async (dep) => {
        if (!dep.id.hasScope() || !dep.id.hasVersion()) return;
        if (isTag(dep.id.version)) return;
        if (allIds.hasWithoutVersion(dep.id)) return; // it's tagged/snapped now.
        let isPartOfHistory: boolean | undefined;
        try {
          isPartOfHistory = lane
            ? (await this.scope.legacyScope.isPartOfLaneHistory(dep.id, lane)) ||
              (await this.scope.legacyScope.isPartOfMainHistory(dep.id))
            : await this.scope.legacyScope.isPartOfMainHistory(dep.id);
        } catch (err) {
          if (throwForMissingObjects) throw err;
          if (err instanceof VersionNotFound) {
            missingDeps.push(dep.id);
            return;
          }
          throw err;
        }

        if (!isPartOfHistory) {
          const laneOrMainStr = lane ? `current lane "${lane.name}"` : 'main';
          throw new Error(
            `unable to tag/snap ${component.id.toString()}, it has a dependency ${dep.id.toString()} which is not part of ${laneOrMainStr} history.
one option to resolve this is installing ${dep.id.toStringWithoutVersion()} via "bit install", which installs the version from main.
another option, in case this dependency is not in main yet is to remove all references of this dependency in the code and then tag/snap.`
          );
        }
      })
    );
    return missingDeps;
  }

  async _addFlattenedDepsGraphToComponents(components: ConsumerComponent[]) {
    const graph = new Graph<BitId, string>();
    const addEdges = (compId: BitId, dependencies: ConsumerComponent['dependencies'], label: DepEdgeType) => {
      dependencies.get().forEach((dep) => {
        graph.setNode(new Node(dep.id.toString(), dep.id));
        graph.setEdge(new Edge(compId.toString(), dep.id.toString(), label));
      });
    };
    components.forEach((comp) => {
      graph.setNode(new Node(comp.id.toString(), comp.id));
      addEdges(comp.id, comp.dependencies, 'prod');
      addEdges(comp.id, comp.devDependencies, 'dev');
      addEdges(comp.id, comp.extensionDependencies, 'ext');
    });
    const allFlattened = components.map((comp) => comp.flattenedDependencies);
    const allFlattenedUniq = BitIds.uniqFromArray(allFlattened.flat());
    const allFlattenedWithoutCurrent = allFlattenedUniq.filter((id) => !components.find((c) => c.id.isEqual(id)));
    const componentsAndVersions = await this.scope.legacyScope.getComponentsAndVersions(
      BitIds.fromArray(allFlattenedWithoutCurrent)
    );
    componentsAndVersions.forEach(({ component, version, versionStr }) => {
      const compId = component.toBitId().changeVersion(versionStr);
      graph.setNode(new Node(compId.toString(), compId));
      addEdges(compId, version.dependencies, 'prod');
      addEdges(compId, version.devDependencies, 'dev');
      addEdges(compId, version.extensionDependencies, 'ext');
    });
    let someCompsHaveMissingFlattened = false;
    components.forEach((component) => {
      const edges = graph.outEdges(component.id.toString());
      const flattenedEdges = component.flattenedDependencies.map((dep) => graph.outEdges(dep.toString())).flat();
      const allEdges = [...edges, ...flattenedEdges];
      const edgesWithBitIds: DepEdge[] = allEdges.map((edge) => ({
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        source: graph.node(edge.source)!.attr,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        target: graph.node(edge.target)!.attr,
        type: edge.attr as DepEdgeType,
      }));
      component.flattenedEdges = edgesWithBitIds;

      // due to some previous bugs, some components might have missing flattened dependencies.
      // as a result, the flattenedEdges may have more components than the flattenedDependencies, which will cause
      // issues later on when the graph is built. this fixes it by adding the missing flattened dependencies, and
      // then recursively adding the flattenedEdge accordingly.
      const flattened = component.flattenedDependencies.map((dep) => dep.toString());
      const flattenedFromEdges = uniq(
        edgesWithBitIds.map((edge) => [edge.target.toString(), edge.source.toString()]).flat()
      );
      const missingFlattened = difference(flattenedFromEdges, flattened).filter((id) => id !== component.id.toString());

      if (missingFlattened.length) {
        someCompsHaveMissingFlattened = true;
        this.logger.warn(`missing flattened for ${component.id.toString()}: ${missingFlattened.join(', ')}`);
        const missingBitIds = missingFlattened.map((id) => {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          return graph.node(id)!.attr;
        });
        component.flattenedDependencies.push(...missingBitIds);
      }
    });
    if (someCompsHaveMissingFlattened) {
      await this._addFlattenedDepsGraphToComponents(components);
    }
  }

  _updateComponentsByTagResult(components: ConsumerComponent[], tagResult: LegacyOnTagResult[]) {
    tagResult.forEach((result) => {
      const matchingComponent = components.find((c) => c.id.isEqual(result.id));
      if (matchingComponent) {
        const existingBuilder = matchingComponent.extensions.findCoreExtension(Extensions.builder);
        if (existingBuilder) existingBuilder.data = result.builderData.data;
        else matchingComponent.extensions.push(result.builderData);
      }
    });
  }

  _getPublishedPackages(components: ConsumerComponent[]): string[] {
    const publishedPackages = components.map((comp) => {
      const builderExt = comp.extensions.findCoreExtension(Extensions.builder);
      const pkgData = builderExt?.data?.aspectsData?.find((a) => a.aspectId === Extensions.pkg);
      return pkgData?.data?.publishedPackage;
    });
    return compact(publishedPackages);
  }

  async _addCompToObjects({
    source,
    consumer,
    lane,
    shouldValidateVersion = false,
  }: {
    source: ConsumerComponent;
    consumer: Consumer;
    lane: Lane | null;
    shouldValidateVersion?: boolean;
  }): Promise<ModelComponent> {
    const { component, version } = await this._addCompFromScopeToObjects(source, lane);
    const unmergedComponent = consumer.scope.objects.unmergedComponents.getEntry(component.name);
    if (unmergedComponent) {
      if (unmergedComponent.unrelated) {
        this.logger.debug(
          `sources.addSource, unmerged component "${component.name}". adding an unrelated entry ${unmergedComponent.head.hash}`
        );
        if (!source.previouslyUsedVersion) {
          throw new Error(
            `source.previouslyUsedVersion must be set for ${component.name} because it's unrelated resolved.`
          );
        }
        const unrelatedHead = Ref.from(source.previouslyUsedVersion);
        version.unrelated = { head: unrelatedHead, laneId: unmergedComponent.laneId };
        version.addAsOnlyParent(unmergedComponent.head);
      } else {
        // this is adding a second parent to the version. the order is important. the first parent is coming from the current-lane.
        version.addParent(unmergedComponent.head);
        this.logger.debug(
          `sources.addSource, unmerged component "${component.name}". adding a parent ${unmergedComponent.head.hash}`
        );
        version.log.message = version.log.message || UnmergedComponents.buildSnapMessage(unmergedComponent);
      }
      consumer.scope.objects.unmergedComponents.removeComponent(component.name);
    }
    if (shouldValidateVersion) version.validate();
    return component;
  }

  async _addCompFromScopeToObjects(
    source: ConsumerComponent,
    lane: Lane | null
  ): Promise<{
    component: ModelComponent;
    version: Version;
  }> {
    const objectRepo = this.objectsRepo;
    // if a component exists in the model, add a new version. Otherwise, create a new component on the model
    const component = await this.scope.legacyScope.sources.findOrAddComponent(source);
    const artifactFiles = getArtifactsFiles(source.extensions);
    const artifacts = this.transformArtifactsFromVinylToSource(artifactFiles);
    const { version, files, flattenedEdges } = await this.scope.legacyScope.sources.consumerComponentToVersion(source);
    objectRepo.add(version);
    if (flattenedEdges) this.objectsRepo.add(flattenedEdges);
    if (!source.version) throw new Error(`addSource expects source.version to be set`);
    component.addVersion(version, source.version, lane, objectRepo, source.previouslyUsedVersion);
    objectRepo.add(component);
    files.forEach((file) => objectRepo.add(file.file));
    if (artifacts) artifacts.forEach((file) => objectRepo.add(file.source));
    return { component, version };
  }

  async _enrichComp(consumerComponent: ConsumerComponent, modifiedLog?: Log) {
    const objects = await this._getObjectsToEnrichComp(consumerComponent, modifiedLog);
    objects.forEach((obj) => this.objectsRepo.add(obj));
    return consumerComponent;
  }

  async _getObjectsToEnrichComp(consumerComponent: ConsumerComponent, modifiedLog?: Log): Promise<BitObject[]> {
    const component =
      consumerComponent.modelComponent || (await this.scope.legacyScope.sources.findOrAddComponent(consumerComponent));
    const version = await component.loadVersion(consumerComponent.id.version as string, this.objectsRepo, true, true);
    if (modifiedLog) version.addModifiedLog(modifiedLog);
    const artifactFiles = getArtifactsFiles(consumerComponent.extensions);
    const artifacts = this.transformArtifactsFromVinylToSource(artifactFiles);
    version.extensions = consumerComponent.extensions;
    version.buildStatus = consumerComponent.buildStatus;
    const artifactObjects = artifacts.map((file) => file.source);
    return [version, ...artifactObjects];
  }

  private transformArtifactsFromVinylToSource(artifactsFiles: ArtifactFiles[]): ArtifactSource[] {
    const artifacts: ArtifactSource[] = [];
    artifactsFiles.forEach((artifactFiles) => {
      const artifactsSource = ArtifactFiles.fromVinylsToSources(artifactFiles.vinyls);
      if (artifactsSource.length) artifactFiles.populateRefsFromSources(artifactsSource);
      artifacts.push(...artifactsSource);
    });
    return artifacts;
  }

  private async loadComponentsForTagOrSnap(ids: BitIds, shouldClearCacheFirst = true): Promise<Component[]> {
    const compIds = await this.workspace.resolveMultipleComponentIds(ids);
    if (shouldClearCacheFirst) {
      await this.workspace.consumer.componentFsCache.deleteAllDependenciesDataCache();
      compIds.map((compId) => this.workspace.clearComponentCache(compId));
    }

    return this.workspace.getMany(compIds.map((id) => id.changeVersion(undefined)));
  }

  private async throwForComponentIssues(components: Component[], ignoreIssues?: string) {
    if (ignoreIssues === '*') {
      // ignore all issues
      return;
    }
    const issuesToIgnoreFromFlag = ignoreIssues?.split(',').map((issue) => issue.trim()) || [];
    const issuesToIgnoreFromConfig = this.issues.getIssuesToIgnoreGlobally();
    const issuesToIgnore = [...issuesToIgnoreFromFlag, ...issuesToIgnoreFromConfig];
    await this.issues.triggerAddComponentIssues(components, issuesToIgnore);
    this.issues.removeIgnoredIssuesFromComponents(components, issuesToIgnore);
    const legacyComponents = components.map((c) => c.state._consumer) as ConsumerComponent[];
    const componentsWithBlockingIssues = legacyComponents.filter((component) => component.issues?.shouldBlockTagging());
    if (!R.isEmpty(componentsWithBlockingIssues)) {
      throw new ComponentsHaveIssues(componentsWithBlockingIssues);
    }

    const workspaceIssues = this.workspace.getWorkspaceIssues();
    if (workspaceIssues.length) {
      const issuesStr = workspaceIssues.map((issueErr) => issueErr.message).join('\n');
      throw new BitError(`the workspace has the following issues:\n${issuesStr}`);
    }
  }

  private throwForPendingImport(components: ConsumerComponent[]) {
    const componentsMissingFromScope = components
      .filter((c) => !c.isRemoved())
      .filter((c) => !c.componentFromModel && c.id.hasScope())
      .map((c) => c.id.toString());
    if (componentsMissingFromScope.length) {
      throw new ComponentsPendingImport(componentsMissingFromScope);
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

  /**
   * the compId.version can be a range (e.g. "^1.0.0"), in which case, it finds the component in the local scope and
   * resolves the latest version that falls under the range.
   * in case the version has no range, it returns the same compId.
   * in case it has no version, it returns the latest.
   */
  async getCompIdWithExactVersionAccordingToSemver(compId: ComponentID): Promise<ComponentID> {
    if (isHash(compId.version)) {
      return compId;
    }
    const range = compId.version || '*'; // if not version specified, assume the latest
    const id = compId.changeVersion(undefined);
    const exactVersion = await this.scope.getExactVersionBySemverRange(id, range);
    if (!exactVersion) {
      throw new Error(`unable to find a version that satisfies "${range}" of "${compId.toString()}"`);
    }
    return compId.changeVersion(exactVersion);
  }

  async updateDependenciesVersionsOfComponent(
    component: Component,
    dependencies: ComponentID[],
    currentBitIds: BitId[]
  ) {
    const depsBitIds = dependencies.map((d) => d._legacy);
    const updatedIds = BitIds.fromArray([...currentBitIds, ...depsBitIds]);
    const componentIdStr = component.id.toString();
    const legacyComponent: ConsumerComponent = component.state._consumer;
    const deps = [...legacyComponent.dependencies.get(), ...legacyComponent.devDependencies.get()];
    const dependenciesList = await this.dependencyResolver.getDependencies(component);
    deps.forEach((dep) => {
      const updatedBitId = updatedIds.searchWithoutVersion(dep.id);
      if (updatedBitId) {
        const depIdStr = dep.id.toString();
        const packageName = dependenciesList.findDependency(depIdStr)?.getPackageName?.();
        if (!packageName) {
          throw new Error(
            `unable to find the package-name of "${depIdStr}" dependency inside the dependency-resolver data of "${componentIdStr}"`
          );
        }
        this.logger.debug(`updating "${componentIdStr}", dependency ${depIdStr} to version ${updatedBitId.version}}`);
        dep.id = updatedBitId;
        dep.packageName = packageName;
      }
    });
    legacyComponent.extensions.forEach((ext) => {
      if (!ext.extensionId) return;
      const updatedBitId = updatedIds.searchWithoutVersion(ext.extensionId);
      if (updatedBitId) {
        this.logger.debug(
          `updating "${componentIdStr}", extension ${ext.extensionId.toString()} to version ${updatedBitId.version}}`
        );
        ext.extensionId = updatedBitId;
      }
    });

    component.state.aspects = await this.scope.createAspectListFromExtensionDataList(legacyComponent.extensions);

    const dependenciesListSerialized = (await this.dependencyResolver.extractDepsFromLegacy(component)).serialize();
    const extId = DependencyResolverAspect.id;
    const data = { dependencies: dependenciesListSerialized };
    const existingExtension = component.state._consumer.extensions.findExtension(extId);
    if (existingExtension) {
      // Only merge top level of extension data
      Object.assign(existingExtension.data, data);
      return;
    }
    const extension = new ExtensionDataEntry(undefined, undefined, extId, undefined, data);
    component.state._consumer.extensions.push(extension);
  }

  private async getComponentsToTag(
    includeUnmodified: boolean,
    exactVersion: string | undefined,
    persist: boolean,
    ids: string[],
    snapped: boolean,
    unmerged: boolean
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

    if (unmerged) {
      return { bitIds: componentsList.listDuringMergeStateComponents(), warnings };
    }

    const tagPendingBitIdsIncludeSnapped = [...tagPendingBitIds, ...snappedComponentsIds];

    if (includeUnmodified && exactVersion) {
      const tagPendingComponentsLatest = await this.workspace.scope.legacyScope.latestVersions(tagPendingBitIds, false);
      tagPendingComponentsLatest.forEach((componentId) => {
        if (componentId.version && semver.valid(componentId.version) && semver.gt(componentId.version, exactVersion)) {
          warnings.push(`warning: ${componentId.toString()} has a version greater than ${exactVersion}`);
        }
      });
    }

    return { bitIds: tagPendingBitIdsIncludeSnapped.map((id) => id.changeVersion(undefined)), warnings };
  }

  static slots = [];
  static dependencies = [
    WorkspaceAspect,
    CLIAspect,
    LoggerAspect,
    IssuesAspect,
    InsightsAspect,
    DependencyResolverAspect,
    ScopeAspect,
    ExportAspect,
    BuilderAspect,
    ImporterAspect,
  ];
  static runtime = MainRuntime;
  static async provider([
    workspace,
    cli,
    loggerMain,
    issues,
    insights,
    dependencyResolver,
    scope,
    exporter,
    builder,
    importer,
  ]: [
    Workspace,
    CLIMain,
    LoggerMain,
    IssuesMain,
    InsightsMain,
    DependencyResolverMain,
    ScopeMain,
    ExportMain,
    BuilderMain,
    ImporterMain
  ]) {
    const logger = loggerMain.createLogger(SnappingAspect.id);
    const snapping = new SnappingMain(
      workspace,
      logger,
      issues,
      insights,
      dependencyResolver,
      scope,
      exporter,
      builder,
      importer
    );
    const snapCmd = new SnapCmd(snapping, logger);
    const tagCmd = new TagCmd(snapping, logger);
    const tagFromScopeCmd = new TagFromScopeCmd(snapping, logger);
    const snapFromScopeCmd = new SnapFromScopeCmd(snapping, logger);
    const resetCmd = new ResetCmd(snapping);
    cli.register(tagCmd, snapCmd, resetCmd, tagFromScopeCmd, snapFromScopeCmd);
    return snapping;
  }
}

SnappingAspect.addRuntime(SnappingMain);

export default SnappingMain;
