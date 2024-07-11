import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { Graph, Node, Edge } from '@teambit/graph.cleargraph';
import { LegacyOnTagResult } from '@teambit/legacy/dist/scope/scope';
import { FlattenedDependenciesGetter } from '@teambit/legacy/dist/scope/component-ops/get-flattened-dependencies';
import { WorkspaceAspect, OutsideWorkspaceError, Workspace } from '@teambit/workspace';
import semver, { ReleaseType } from 'semver';
import { compact, difference, uniq } from 'lodash';
import { ComponentID, ComponentIdList } from '@teambit/component-id';
import { Extensions, LATEST, BuildStatus } from '@teambit/legacy/dist/constants';
import { Consumer } from '@teambit/legacy/dist/consumer';
import { ComponentsList } from '@teambit/legacy.component-list';
import pMapSeries from 'p-map-series';
import loader from '@teambit/legacy/dist/cli/loader';
import ComponentsPendingImport from '@teambit/legacy/dist/consumer/exceptions/components-pending-import';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import { BitError } from '@teambit/bit-error';
import ConsumerComponent from '@teambit/legacy/dist/consumer/component/consumer-component';
import pMap from 'p-map';
import { InsightsAspect, InsightsMain } from '@teambit/insights';
import { validateVersion } from '@teambit/pkg.modules.semver-helper';
import { concurrentComponentsLimit } from '@teambit/harmony.modules.concurrency';
import { ScopeAspect, ScopeMain } from '@teambit/scope';
import { Lane, ModelComponent } from '@teambit/legacy/dist/scope/models';
import { IssuesAspect, IssuesMain } from '@teambit/issues';
import { Component } from '@teambit/component';
import { DependencyResolverAspect, DependencyResolverMain } from '@teambit/dependency-resolver';
import { ExtensionDataEntry } from '@teambit/legacy/dist/consumer/config';
import { BuilderAspect, BuilderMain } from '@teambit/builder';
import { LaneId } from '@teambit/lane-id';
import { ImporterAspect, ImporterMain } from '@teambit/importer';
import { ExportAspect, ExportMain } from '@teambit/export';
import UnmergedComponents from '@teambit/legacy/dist/scope/lanes/unmerged-components';
import { isHash, isTag } from '@teambit/component-version';
import { BitObject, Ref, Repository } from '@teambit/legacy/dist/scope/objects';
import { GlobalConfigAspect, GlobalConfigMain } from '@teambit/global-config';
import { ArtifactFiles, ArtifactSource, getArtifactsFiles, SourceFile } from '@teambit/component.sources';
import {
  VersionNotFound,
  ComponentNotFound,
  HeadNotFound,
  ParentNotFound,
} from '@teambit/legacy/dist/scope/exceptions';
import { AutoTagResult } from '@teambit/legacy/dist/scope/component-ops/auto-tag';
import { DependenciesAspect, DependenciesMain } from '@teambit/dependencies';
import Version, { DepEdge, DepEdgeType, Log } from '@teambit/legacy/dist/scope/models/version';
import { SnapCmd } from './snap-cmd';
import { SnappingAspect } from './snapping.aspect';
import { TagCmd } from './tag-cmd';
import { ComponentsHaveIssues } from './components-have-issues';
import ResetCmd from './reset-cmd';
import { tagModelComponent, updateComponentsVersions, BasicTagParams, BasicTagSnapParams } from './tag-model-component';
import { TagDataPerCompRaw, TagFromScopeCmd } from './tag-from-scope.cmd';
import { SnapDataPerCompRaw, SnapFromScopeCmd, FileData } from './snap-from-scope.cmd';
import { addDeps, generateCompFromScope } from './generate-comp-from-scope';
import { FlattenedEdgesGetter } from './flattened-edges';
import { SnapDistanceCmd } from './snap-distance-cmd';
import {
  removeLocalVersionsForAllComponents,
  untagResult,
  getComponentsWithOptionToUntag,
  removeLocalVersionsForMultipleComponents,
} from './reset-component';

export type TagDataPerComp = {
  componentId: ComponentID;
  dependencies: ComponentID[];
  versionToTag?: string; // must be set for tag. undefined for snap.
  prereleaseId?: string;
  message?: string;
  isNew?: boolean;
};

export type SnapDataParsed = {
  componentId: ComponentID;
  dependencies: string[];
  aspects?: Record<string, any>;
  message?: string;
  files?: FileData[];
  isNew?: boolean;
  newDependencies?: {
    id: string; // component-id or package-name.
    version?: string; // for packages, it is mandatory.
    isComponent: boolean;
    type: 'runtime' | 'dev' | 'peer';
  }[];
  removeDependencies?: string[];
};

export type SnapResults = BasicTagResults & {
  snappedComponents: ConsumerComponent[];
  autoSnappedResults: AutoTagResult[];
  laneName: string | null; // null if default
};

export type SnapFromScopeResults = {
  snappedIds: ComponentID[];
  exportedIds?: ComponentID[];
  snappedComponents: ConsumerComponent[];
};

export type TagResults = BasicTagResults & {
  taggedComponents: ConsumerComponent[];
  autoTaggedResults: AutoTagResult[];
  isSoftTag: boolean;
  publishedPackages: string[];
};

export type BasicTagResults = {
  warnings: string[];
  newComponents: ComponentIdList;
  removedComponents?: ComponentIdList;
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
    private importer: ImporterMain,
    private deps: DependenciesMain
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
    skipTasks,
    skipAutoTag = false,
    build,
    unmodified = false,
    soft = false,
    persist = false,
    ignoreBuildErrors = false,
    rebuildDepsGraph,
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
    if (!bitIds.length) return null;

    const compIds = ComponentIdList.fromArray(bitIds);

    this.logger.debug(`tagging the following components: ${compIds.toString()}`);
    const components = await this.loadComponentsForTagOrSnap(compIds, !soft);
    const consumerComponents = components.map((c) => c.state._consumer) as ConsumerComponent[];
    await this.throwForVariousIssues(components, ignoreIssues);

    const { taggedComponents, autoTaggedResults, publishedPackages, stagedConfig, removedComponents } =
      await tagModelComponent({
        workspace: this.workspace,
        scope: this.scope,
        snapping: this,
        builder: this.builder,
        consumerComponents,
        ids: compIds,
        message,
        editor,
        exactVersion: validExactVersion,
        releaseType,
        preReleaseId,
        ignoreNewestVersion,
        skipTests,
        skipTasks,
        skipAutoTag,
        soft,
        build,
        persist,
        disableTagAndSnapPipelines,
        ignoreBuildErrors,
        rebuildDepsGraph,
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

    await consumer.onDestroy(`tag (message: ${message || 'N/A'})`);
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
      rebuildArtifacts?: boolean;
    } & Partial<BasicTagParams>
  ): Promise<TagResults | null> {
    if (this.workspace) {
      throw new BitError(
        `unable to run this command from a workspace, please create a new bare-scope and run it from there`
      );
    }
    if (!this.scope) {
      throw new BitError(`please create a new bare-scope and run it from there`);
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
    const componentIds = ComponentIdList.fromArray(tagDataPerComp.map((t) => t.componentId));
    // important! leave the "preferDependencyGraph" with the default - true. no need to bring all dependencies at this
    // stage. later on, they'll be imported during "snapping._addFlattenedDependenciesToComponents".
    // otherwise, the dependencies are imported without version-history and fail later when checking their origin.
    await this.scope.import(componentIds, { reason: 'of the seeders to tag' });
    const deps = compact(tagDataPerComp.map((t) => t.dependencies).flat()).map((dep) => dep.changeVersion(LATEST));
    const additionalComponentIdsToFetch = await Promise.all(
      componentIds.map(async (id) => {
        if (!id.hasVersion()) return null;
        const modelComp = await this.scope.getBitObjectModelComponent(id);
        if (!modelComp) throw new Error(`unable to find ModelComponent of ${id.toString()}`);
        if (!modelComp.head) return null;
        if (modelComp.getRef(id.version as string)?.isEqual(modelComp.head)) return null;
        if (!params.ignoreNewestVersion) {
          throw new BitError(`unable to tag "${id.toString()}", this version is older than the head ${modelComp.head.toString()}.
if you're willing to lose the history from the head to the specified version, use --ignore-newest-version flag`);
        }
        return id.changeVersion(LATEST);
      })
    );

    // import deps to be able to resolve semver
    await this.scope.import([...deps, ...compact(additionalComponentIdsToFetch)], {
      useCache: false,
      reason: `which are the dependencies of the ${componentIds.length} seeders`,
    });
    await Promise.all(
      tagDataPerComp.map(async (tagData) => {
        // disregard the dependencies that are now part of the tag-from-scope. their version will be determined during the process
        const filteredDependencies = tagData.dependencies.filter((dep) => !componentIds.hasWithoutVersion(dep));
        tagData.dependencies = await Promise.all(
          filteredDependencies.map((d) => this.getCompIdWithExactVersionAccordingToSemver(d))
        );
      })
    );
    const components = await this.scope.getMany(componentIds);
    await Promise.all(
      components.map(async (comp) => {
        const tagData = tagDataPerComp.find((t) => t.componentId.isEqual(comp.id, { ignoreVersion: true }));
        if (!tagData) throw new Error(`unable to find ${comp.id.toString()} in tagDataPerComp`);
        if (!tagData.dependencies.length) return;
        await this.updateDependenciesVersionsOfComponent(comp, tagData.dependencies, componentIds);
      })
    );

    await this.scope.loadManyCompsAspects(components);

    const consumerComponents = components.map((c) => c.state._consumer) as ConsumerComponent[];
    const shouldUsePopulateArtifactsFrom = components.every((comp) => {
      if (!comp.buildStatus) throw new Error(`tag-from-scope expect ${comp.id.toString()} to have buildStatus`);
      return comp.buildStatus === BuildStatus.Succeed && !params.rebuildArtifacts;
    });
    const legacyIds = ComponentIdList.fromArray(componentIds.map((id) => id));
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
      newComponents: new ComponentIdList(),
    };
  }

  async snapFromScope(
    snapDataPerCompRaw: SnapDataPerCompRaw[],
    params: {
      push?: boolean;
      ignoreIssues?: string;
      lane?: string;
      updateDependents?: boolean;
    } & Partial<BasicTagParams>
  ): Promise<SnapFromScopeResults> {
    if (this.workspace) {
      throw new BitError(
        `unable to run this command from a workspace, please create a new bare-scope and run it from there`
      );
    }
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
    const laneCompIds = lane?.toComponentIdsIncludeUpdateDependents();
    const snapDataPerComp = snapDataPerCompRaw.map((snapData) => {
      return {
        componentId: ComponentID.fromString(snapData.componentId),
        dependencies: snapData.dependencies || [],
        aspects: snapData.aspects,
        message: snapData.message,
        files: snapData.files,
        isNew: snapData.isNew,
        mainFile: snapData.mainFile,
        newDependencies: (snapData.newDependencies || []).map((dep) => ({
          id: dep.id,
          version: dep.version,
          isComponent: dep.isComponent ?? true,
          type: dep.type ?? 'runtime',
        })),
        removeDependencies: snapData.removeDependencies,
      };
    });

    // console.log('snapDataPerComp', JSON.stringify(snapDataPerComp, undefined, 2));

    const componentIds = compact(snapDataPerComp.map((t) => (t.isNew ? null : t.componentId)));
    const allCompIds = snapDataPerComp.map((s) => s.componentId);
    const componentIdsLatest = componentIds.map((id) => id.changeVersion(LATEST));
    const newCompsData = compact(snapDataPerComp.map((t) => (t.isNew ? t : null)));
    const newComponents = await Promise.all(
      newCompsData.map((newComp) => generateCompFromScope(this.scope, newComp, this))
    );

    await this.scope.import(componentIdsLatest, {
      preferDependencyGraph: false,
      lane,
      reason: `seeders to snap`,
    });
    const getSnapData = (id: ComponentID): SnapDataParsed => {
      const snapData = snapDataPerComp.find((t) => {
        return t.componentId.isEqual(id, { ignoreVersion: true });
      });
      if (!snapData) throw new Error(`unable to find ${id.toString()} in snapDataPerComp`);
      return snapData;
    };
    const existingComponents = await this.scope.getMany(componentIdsLatest);

    // in case of update-dependents, align the dependencies of the dependents according to the lane
    if (params.updateDependents && laneCompIds) {
      existingComponents.forEach((comp) => {
        const deps = this.dependencyResolver.getComponentDependencies(comp);
        const snapData = getSnapData(comp.id);
        deps.forEach((dep) => {
          const fromLane = laneCompIds.searchWithoutVersion(dep.componentId);
          if (fromLane) {
            snapData.dependencies.push(fromLane.toString());
          }
        });
      });
    }

    const components = [...existingComponents, ...newComponents];

    // this must be done before we load component aspects later on, because this updated deps may update aspects.
    await pMapSeries(components, async (component) => {
      const snapData = getSnapData(component.id);
      // adds explicitly defined dependencies and dependencies from envs/aspects (overrides)
      await addDeps(component, snapData, this.scope, this.deps, this.dependencyResolver, this);
    });

    // for new components these are not needed. coz when generating them we already add the aspects and the files.
    await Promise.all(
      existingComponents.map(async (comp) => {
        const snapData = getSnapData(comp.id);
        if (snapData.aspects) await this.scope.addAspectsFromConfigObject(comp, snapData.aspects);
        if (snapData.files?.length) {
          await this.updateSourceFiles(comp, snapData.files);
        }
      })
    );

    // load the aspects user configured to set on the components. it creates capsules if needed.
    // otherwise, when a user set a custom-env, it won't be loaded and the Version object will leave the
    // teambit.envs/envs in a weird state. the config will be set correctly but the data will be set to the default
    // node env.
    await this.scope.loadManyCompsAspects(components);

    // this is similar to what happens in the workspace. the "onLoad" is running and populating the "data" of the aspects.
    await pMapSeries(components, async (comp) => this.scope.executeOnCompAspectReCalcSlot(comp));

    const consumerComponents = components.map((c) => c.state._consumer);
    const ids = ComponentIdList.fromArray(allCompIds);
    const results = await tagModelComponent({
      ...params,
      scope: this.scope,
      consumerComponents,
      tagDataPerComp: snapDataPerComp.map((s) => ({
        componentId: s.componentId,
        message: s.message,
        dependencies: [],
      })),
      snapping: this,
      builder: this.builder,
      dependencyResolver: this.dependencyResolver,
      skipAutoTag: true,
      persist: true,
      isSnap: true,
      ids,
      message: params.message as string,
      updateDependentsOnLane: params.updateDependents,
    });

    const { taggedComponents } = results;
    let exportedIds: ComponentIdList | undefined;
    if (params.push) {
      const updatedLane = lane ? await this.scope.legacyScope.loadLane(lane.toLaneId()) : undefined;
      const { exported } = await this.exporter.exportMany({
        scope: this.scope.legacyScope,
        ids,
        idsWithFutureScope: ids,
        allVersions: false,
        laneObject: updatedLane,
        // no need other snaps. only the latest one. without this option, when snapping on lane from another-scope, it
        // may throw an error saying the previous snaps don't exist on the filesystem.
        // (see the e2e - "snap on a lane when the component is new to the lane and the scope")
        exportHeadsOnly: true,
      });
      exportedIds = exported;
    }

    return {
      snappedComponents: taggedComponents,
      snappedIds: taggedComponents.map((comp) => comp.id),
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
    skipTasks,
    skipAutoSnap = false,
    build,
    disableTagAndSnapPipelines = false,
    ignoreBuildErrors = false,
    rebuildDepsGraph,
    unmodified = false,
    exitOnFirstFailedTask = false,
  }: Partial<BasicTagSnapParams> & {
    pattern?: string;
    legacyBitIds?: ComponentIdList;
    unmerged?: boolean;
    editor?: string;
    ignoreIssues?: string;
    skipAutoSnap?: boolean;
    disableTagAndSnapPipelines?: boolean;
    unmodified?: boolean;
    exitOnFirstFailedTask?: boolean;
  }): Promise<SnapResults | null> {
    if (!this.workspace) throw new OutsideWorkspaceError();
    if (pattern && legacyBitIds) throw new Error(`please pass either pattern or legacyBitIds, not both`);
    const consumer: Consumer = this.workspace.consumer;
    const componentsList = new ComponentsList(consumer);
    const newComponents = (await componentsList.listNewComponents()) as ComponentIdList;
    const ids = legacyBitIds || (await getIdsToSnap(this.workspace));
    if (!ids) return null;
    this.logger.debug(`snapping the following components: ${ids.toString()}`);
    const components = await this.loadComponentsForTagOrSnap(ids);
    const consumerComponents = components.map((c) => c.state._consumer) as ConsumerComponent[];
    await this.throwForVariousIssues(components, ignoreIssues);

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
      skipTasks,
      skipAutoTag: skipAutoSnap,
      persist: true,
      soft: false,
      build,
      isSnap: true,
      disableTagAndSnapPipelines,
      ignoreBuildErrors,
      rebuildDepsGraph,
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
    await consumer.onDestroy(`snap (message: ${message || 'N/A'})`);
    await stagedConfig?.write();
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return snapResults;

    async function getIdsToSnap(workspace: Workspace): Promise<ComponentIdList | null> {
      if (unmerged) {
        return componentsList.listDuringMergeStateComponents();
      }
      const tagPendingComponentsIds = unmodified
        ? await workspace.listPotentialTagIds()
        : await workspace.listTagPendingIds();
      if (!tagPendingComponentsIds.length) return null;
      // when unmodified, we ask for all components, throw if no matching. if not unmodified and no matching, see error
      // below, suggesting to use --unmodified flag.
      const shouldThrowForNoMatching = unmodified;
      const getCompIds = async () => {
        if (!pattern) return tagPendingComponentsIds;
        if (!pattern.includes('*') && !pattern.includes(',')) {
          const compId = await workspace.resolveComponentId(pattern);
          return [compId];
        }
        return workspace.filterIdsFromPoolIdsByPattern(pattern, tagPendingComponentsIds, shouldThrowForNoMatching);
      };
      const componentIds = await getCompIds();
      if (!componentIds.length && pattern) {
        const allTagPending = await workspace.listPotentialTagIds();
        if (allTagPending.length) {
          throw new BitError(`unable to find matching for "${pattern}" pattern among modified/new components.
there are matching among unmodified components though. consider using --unmodified flag if needed.
in case you're unsure about the pattern syntax, use "bit pattern [--help]"`);
        }
      }
      if (!componentIds.length) {
        return null;
      }
      return ComponentIdList.fromArray(componentIds);
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
      const idsMatchingPattern = await this.workspace.idsByPattern(componentPattern, true, { includeDeleted: true });
      const idsMatchingPatternBitIds = ComponentIdList.fromArray(idsMatchingPattern);
      const componentsToUntag = candidateComponents.filter((modelComponent) =>
        idsMatchingPatternBitIds.hasWithoutVersion(modelComponent.toComponentId())
      );
      return removeLocalVersionsForMultipleComponents(componentsToUntag, currentLane, head, force, consumer.scope);
    };
    const softUntag = async () => {
      const softTaggedComponentsIds = this.workspace.filter.bySoftTagged();
      const idsToRemoveSoftTags = componentPattern
        ? await this.workspace.filterIdsFromPoolIdsByPattern(componentPattern, softTaggedComponentsIds)
        : softTaggedComponentsIds;
      return compact(
        idsToRemoveSoftTags.map((componentId) => {
          const componentMap = consumer.bitMap.getComponent(componentId, { ignoreVersion: true });
          const removedVersion = componentMap.nextVersion?.version;
          if (!removedVersion) return null;
          componentMap.clearNextVersion();
          return { id: componentId, versions: [removedVersion] };
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

    await consumer.onDestroy('reset');
    return { results, isSoftUntag: !isRealUntag };
  }

  async resetNeverExported(): Promise<ComponentID[]> {
    const notExported = this.workspace.consumer.getNotExportedIds();
    const hashes = notExported.map((id) => BitObject.makeHash(id.fullName));
    await this.scope.legacyScope.objects.deleteObjectsFromFS(hashes.map((h) => Ref.from(h)));
    notExported.map((id) => this.workspace.consumer.bitMap.updateComponentId(id.changeVersion(undefined)));
    await this.workspace.bitMap.write(`reset (never-exported)`);
    return notExported;
  }

  async _addFlattenedDependenciesToComponents(components: ConsumerComponent[], rebuildDepsGraph = false) {
    loader.start('importing missing dependencies...');
    this.logger.profile('snap._addFlattenedDependenciesToComponents');
    const getLane = async () => {
      const lane = await this.scope.legacyScope.getCurrentLaneObject();
      if (!lane) return undefined;
      if (!lane.isNew) return lane;
      const forkedFrom = lane.forkedFrom;
      if (!forkedFrom) return undefined;
      return this.scope.legacyScope.loadLane(forkedFrom);
    };
    const lane = await getLane();

    if (rebuildDepsGraph) {
      const flattenedDependenciesGetter = new FlattenedDependenciesGetter(this.scope.legacyScope, components, lane);
      await flattenedDependenciesGetter.populateFlattenedDependencies();
      loader.stop();
      await this._addFlattenedDepsGraphToComponents(components);
      return;
    }

    const flattenedEdgesGetter = new FlattenedEdgesGetter(this.scope, components, this.logger, lane);
    await flattenedEdgesGetter.buildGraph();

    components.forEach((component) => {
      flattenedEdgesGetter.populateFlattenedAndEdgesForComp(component);
    });
    this.logger.profile('snap._addFlattenedDependenciesToComponents');
  }

  async throwForDepsFromAnotherLane(components: ConsumerComponent[]) {
    const lane = await this.scope.legacyScope.getCurrentLaneObject();
    const allIds = ComponentIdList.fromArray(components.map((c) => c.id));
    const missingDeps = await pMapSeries(components, async (component) => {
      return this.throwForDepsFromAnotherLaneForComp(component, allIds, lane);
    });
    const flattenedMissingDeps = ComponentIdList.uniqFromArray(
      missingDeps.flat().map((id) => id.changeVersion(undefined))
    );
    if (!flattenedMissingDeps.length) return;
    // ignore the cache. even if the component exists locally, we still need its VersionHistory object
    // in order to traverse the history and determine whether it's part of the lane history.
    await this.scope.legacyScope.scopeImporter.importWithoutDeps(flattenedMissingDeps, {
      cache: false,
      ignoreMissingHead: true,
      includeVersionHistory: true,
      lane,
      reason: 'of latest with version-history to make sure there are no dependencies from another lane',
    });
    await pMapSeries(components, async (component) => {
      await this.throwForDepsFromAnotherLaneForComp(component, allIds, lane, true);
    });
  }

  private async throwForVariousIssues(components: Component[], ignoreIssues?: string) {
    const componentsToCheck = components.filter((c) => !c.isDeleted());
    const consumerComponents = componentsToCheck.map((c) => c.state._consumer) as ConsumerComponent[];
    await this.throwForLegacyDependenciesInsideHarmony(consumerComponents);
    await this.throwForComponentIssues(componentsToCheck, ignoreIssues);
    this.throwForPendingImport(consumerComponents);
  }

  private async throwForDepsFromAnotherLaneForComp(
    component: ConsumerComponent,
    allIds: ComponentIdList,
    lane?: Lane,
    throwForMissingObjects = false
  ) {
    const deps = component.getAllDependencies();
    const missingDeps: ComponentID[] = [];
    await Promise.all(
      deps.map(async (dep) => {
        if (!this.scope.isExported(dep.id) || !dep.id.hasVersion()) return;
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
          if (
            err instanceof VersionNotFound ||
            err instanceof ComponentNotFound ||
            err instanceof HeadNotFound ||
            err instanceof ParentNotFound
          ) {
            missingDeps.push(dep.id);
            return;
          }
          throw err;
        }

        if (!isPartOfHistory) {
          if (!throwForMissingObjects) {
            // it's possible that the dependency wasn't imported recently and the head is stale.
            missingDeps.push(dep.id);
            return;
          }
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
    const graph = new Graph<ComponentID, string>();
    const addEdges = (compId: ComponentID, dependencies: ConsumerComponent['dependencies'], label: DepEdgeType) => {
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
    const allFlattenedUniq = ComponentIdList.uniqFromArray(allFlattened.flat());
    const allFlattenedWithoutCurrent = allFlattenedUniq.filter((id) => !components.find((c) => c.id.isEqual(id)));
    const componentsAndVersions = await this.scope.legacyScope.getComponentsAndVersions(
      ComponentIdList.fromArray(allFlattenedWithoutCurrent)
    );
    componentsAndVersions.forEach(({ component, version, versionStr }) => {
      const compId = component.toComponentId().changeVersion(versionStr);
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
    lane,
    shouldValidateVersion = false,
    updateDependentsOnLane = false,
  }: {
    source: ConsumerComponent;
    lane?: Lane;
    shouldValidateVersion?: boolean;
    updateDependentsOnLane?: boolean;
  }): Promise<{
    component: ModelComponent;
    version: Version;
  }> {
    const { component, version } = await this._addCompFromScopeToObjects(source, lane, updateDependentsOnLane);
    const unmergedComponent = this.scope.legacyScope.objects.unmergedComponents.getEntry(component.toComponentId());
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
        if (unmergedComponent.unrelated === true) {
          // backward compatibility
          const unrelatedHead = Ref.from(source.previouslyUsedVersion);
          version.setUnrelated({ head: unrelatedHead, laneId: unmergedComponent.laneId });
          version.addAsOnlyParent(unmergedComponent.head);
        } else {
          const unrelated = unmergedComponent.unrelated;
          version.setUnrelated({ head: unrelated.unrelatedHead, laneId: unrelated.unrelatedLaneId });
          version.addAsOnlyParent(unrelated.headOnCurrentLane);
        }
      } else {
        // this is adding a second parent to the version. the order is important. the first parent is coming from the current-lane.
        version.addParent(unmergedComponent.head);
        this.logger.debug(
          `sources.addSource, unmerged component "${component.name}". adding a parent ${unmergedComponent.head.hash}`
        );
        version.log.message = version.log.message || UnmergedComponents.buildSnapMessage(unmergedComponent);
      }
      this.scope.legacyScope.objects.unmergedComponents.removeComponent(component.toComponentId());
    }
    if (shouldValidateVersion) version.validate();
    return { component, version };
  }

  async _addCompFromScopeToObjects(
    source: ConsumerComponent,
    lane?: Lane,
    updateDependentsOnLane = false
  ): Promise<{
    component: ModelComponent;
    version: Version;
  }> {
    const objectRepo = this.objectsRepo;
    // if a component exists in the model, add a new version. Otherwise, create a new component on the model
    // @todo: fix the ts error here with "source"
    const component = await this.scope.legacyScope.sources.findOrAddComponent(source as any);
    const artifactFiles = getArtifactsFiles(source.extensions);
    const artifacts = this.transformArtifactsFromVinylToSource(artifactFiles);
    const { version, files, flattenedEdges } = await this.scope.legacyScope.sources.consumerComponentToVersion(source);
    version.origin = {
      id: { scope: source.scope || (source.defaultScope as string), name: source.name },
      lane: lane ? { scope: lane.scope, name: lane.name, hash: lane.hash().toString() } : undefined,
    };
    objectRepo.add(version);
    if (flattenedEdges) this.objectsRepo.add(flattenedEdges);
    if (!source.version) throw new Error(`addSource expects source.version to be set`);
    component.addVersion(version, source.version, lane, source.previouslyUsedVersion, updateDependentsOnLane);
    objectRepo.add(component);
    if (lane) objectRepo.add(lane);
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
      consumerComponent.modelComponent || // @todo: fix the ts error here with "source"
      (await this.scope.legacyScope.sources.findOrAddComponent(consumerComponent as any));
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

  private async loadComponentsForTagOrSnap(ids: ComponentIdList, shouldClearCacheFirst = true): Promise<Component[]> {
    if (shouldClearCacheFirst) {
      await this.workspace.consumer.componentFsCache.deleteAllDependenciesDataCache();
      // don't clear only the cache of these ids. we need also the auto-tag. so it's safer to just clear all.
      this.workspace.clearAllComponentsCache();
    }

    return this.workspace.getMany(ids.map((id) => id.changeVersion(undefined)));
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
    if (componentsWithBlockingIssues.length) {
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
      .filter((c) => !c.componentFromModel && this.scope.isExported(c.id))
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

  private async updateSourceFiles(component: Component, files: FileData[]) {
    const currentFiles = component.state.filesystem.files;

    files.forEach((file) => {
      if (file.delete) {
        const index = currentFiles.findIndex((f) => f.path === file.path);
        if (index !== -1) {
          currentFiles.splice(index, 1);
        }
        return;
      }
      const currentFile = currentFiles.find((f) => f.path === file.path);
      if (currentFile) {
        currentFile.contents = Buffer.from(file.content);
      } else {
        currentFiles.push(
          new SourceFile({ base: '.', path: file.path, contents: Buffer.from(file.content), test: false })
        );
      }
    });

    if (!currentFiles.length)
      throw new Error(`unable to update component ${component.id.toString()}, all files were deleted`);
  }

  async updateDependenciesVersionsOfComponent(
    component: Component,
    dependencies: ComponentID[],
    currentBitIds: ComponentID[]
  ) {
    const updatedIds = ComponentIdList.fromArray([...currentBitIds, ...dependencies]);
    const componentIdStr = component.id.toString();
    const legacyComponent: ConsumerComponent = component.state._consumer;
    const deps = [...legacyComponent.dependencies.get(), ...legacyComponent.devDependencies.get()];
    const dependenciesList = this.dependencyResolver.getDependencies(component);
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
    await this.UpdateDepsAspectsSaveIntoDepsResolver(component, updatedIds.toStringArray());
  }

  /**
   * it does two things:
   * 1. update extensions versions according to the version provided in updatedIds.
   * 2. save all dependencies data from the legacy into DependencyResolver aspect.
   */
  async UpdateDepsAspectsSaveIntoDepsResolver(component: Component, updatedIds: string[]) {
    const legacyComponent: ConsumerComponent = component.state._consumer;
    legacyComponent.extensions.forEach((ext) => {
      const extId = ext.extensionId;
      if (!extId) return;
      const found = updatedIds.find((d) => d.startsWith(`${extId.toStringWithoutVersion()}@`));
      if (found) {
        const updatedExtId = ComponentID.fromString(found);
        this.logger.debug(
          `updating "${component.id.toString()}", extension ${extId.toString()} to version ${updatedExtId.version}}`
        );
        ext.extensionId = updatedExtId;
        if (ext.newExtensionId) ext.newExtensionId = updatedExtId;
      }
    });

    component.state.aspects = await this.scope.createAspectListFromExtensionDataList(legacyComponent.extensions);

    const dependenciesListSerialized = (await this.dependencyResolver.extractDepsFromLegacy(component)).serialize();
    const extId = DependencyResolverAspect.id;
    const data = { dependencies: dependenciesListSerialized };
    const existingExtension = component.config.extensions.findExtension(extId);
    if (existingExtension) {
      // Only merge top level of extension data
      Object.assign(existingExtension.data, data);
      return;
    }
    const extension = new ExtensionDataEntry(undefined, undefined, extId, undefined, data);
    component.config.extensions.push(extension);
  }

  private async getComponentsToTag(
    includeUnmodified: boolean,
    exactVersion: string | undefined,
    persist: boolean,
    ids: string[],
    snapped: boolean,
    unmerged: boolean
  ): Promise<{ bitIds: ComponentID[]; warnings: string[] }> {
    const warnings: string[] = [];
    const componentsList = new ComponentsList(this.workspace.consumer);
    if (persist) {
      const softTaggedComponents = this.workspace.filter.bySoftTagged();
      return { bitIds: softTaggedComponents, warnings: [] };
    }

    const tagPendingComponentsIds = includeUnmodified
      ? await this.workspace.listPotentialTagIds()
      : await this.workspace.listTagPendingIds();

    const snappedComponentsIds = (await this.workspace.filter.bySnappedOnMain()).map((id) =>
      id.changeVersion(undefined)
    );

    if (ids.length) {
      const componentIds = await pMapSeries(ids, async (id) => {
        const [idWithoutVer, version] = id.split('@');
        const idIsPattern = this.workspace.isPattern(id);
        if (idIsPattern) {
          const allIds = await this.workspace.filterIdsFromPoolIdsByPattern(idWithoutVer, tagPendingComponentsIds);
          return allIds.map((componentId) => componentId.changeVersion(version));
        }
        const componentId = await this.workspace.resolveComponentId(idWithoutVer);
        if (!includeUnmodified) {
          const componentStatus = await this.workspace.getComponentStatusById(componentId);
          if (componentStatus.modified === false) return null;
        }
        return componentId.changeVersion(version);
      });

      return { bitIds: compact(componentIds.flat()), warnings };
    }

    if (snapped) {
      return { bitIds: snappedComponentsIds, warnings };
    }

    if (unmerged) {
      return { bitIds: componentsList.listDuringMergeStateComponents(), warnings };
    }

    const tagPendingBitIds = tagPendingComponentsIds.map((id) => id);
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
    GlobalConfigAspect,
    DependenciesAspect,
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
    globalConfig,
    deps,
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
    ImporterMain,
    GlobalConfigMain,
    DependenciesMain
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
      importer,
      deps
    );
    const snapCmd = new SnapCmd(snapping, logger, globalConfig);
    const tagCmd = new TagCmd(snapping, logger, globalConfig);
    const tagFromScopeCmd = new TagFromScopeCmd(snapping, logger);
    const snapFromScopeCmd = new SnapFromScopeCmd(snapping, logger);
    const resetCmd = new ResetCmd(snapping);
    const snapDistanceCmd = new SnapDistanceCmd(scope);
    cli.register(tagCmd, snapCmd, resetCmd, tagFromScopeCmd, snapFromScopeCmd, snapDistanceCmd);
    return snapping;
  }
}

SnappingAspect.addRuntime(SnappingMain);

export default SnappingMain;
