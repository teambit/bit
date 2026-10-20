import type { Workspace } from '@teambit/workspace';
import mapSeries from 'p-map-series';
import type { ComponentID } from '@teambit/component-id';
import { ComponentIdList } from '@teambit/component-id';
import type { LaneId } from '@teambit/lane-id';
import { DEFAULT_LANE } from '@teambit/lane-id';
import type { SnapsDistance } from '@teambit/component.snap-distance';
import { getDivergeData } from '@teambit/component.snap-distance';
import type { Lane, ModelComponent, Ref, Version } from '@teambit/objects';
import { NoCommonSnap, Tmp } from '@teambit/legacy.scope';
import type { ConsumerComponent } from '@teambit/legacy.consumer-component';
import type { ImporterMain } from '@teambit/importer';
import type { Logger } from '@teambit/logger';
import { compact, isEqual } from 'lodash';
import { ComponentConfigMerger } from '@teambit/config-merger';
import type { ScopeMain } from '@teambit/scope';
import type { MergeResultsThreeWay, MergeStrategy } from '@teambit/component.modules.merge-helper';
import { applyModifiedVersion, MergeOptions, threeWayMerge } from '@teambit/component.modules.merge-helper';
import type { ComponentMergeStatus, ComponentMergeStatusBeforeMergeAttempt } from './merging.main.runtime';
import type { ExtensionDataList } from '@teambit/legacy.extension-data';
import type { VariantPolicyEntry } from '@teambit/dependency-resolver';
import { DependencyResolverAspect } from '@teambit/dependency-resolver';
import { MANUALLY_REMOVE_DEPENDENCY } from '@teambit/legacy.constants';
import { BuilderAspect } from '@teambit/builder';
import { DevFilesAspect } from '@teambit/dev-files';
import { SourceFile } from '@teambit/component.sources';
import type { FileContent, ImportsCache } from '@teambit/dependencies';
import { detectImportedPackages } from '@teambit/dependencies';
import { matchPatterns, splitPatterns } from '@teambit/toolbox.path.match-patterns';
import { pathNormalizeToLinux } from '@teambit/toolbox.path.path';
import type { DependenciesSnapshot, ImportsOfMerge, SideOfMerge } from './merge-dependencies';
import {
  getDependenciesOfVersion,
  getImportedPackagesWithoutVersion,
  mergeDependencies,
  withoutIgnoredImports,
} from './merge-dependencies';

export type MergeStatusProviderOptions = {
  resolveUnrelated?: MergeStrategy;
  mergeStrategy: MergeStrategy;
  ignoreConfigChanges?: boolean;
  shouldSquash?: boolean;
  handleTargetAheadAsDiverged?: boolean;
  detachHead?: boolean;
  shouldMergeAspectsData?: boolean;
};

type ConflictedDataAspects = { [extId: string]: string }; // extId => reason

export type DataMergeResult = {
  conflictedAspects?: ConflictedDataAspects;
};

export const compIsAlreadyMergedMsg = 'component is already merged';
export const compHasBeenRemovedMsg = 'component has been removed';
export class MergeStatusProvider {
  constructor(
    private scope: ScopeMain,
    private logger: Logger,
    private importer: ImporterMain,
    private options: MergeStatusProviderOptions,
    private workspace?: Workspace,
    private currentLane?: Lane, // currently checked out lane. if on main, then it's undefined.
    private otherLane?: Lane // the lane we want to merged to our lane. (undefined if it's "main").
  ) {}

  async getStatus(
    bitIds: ComponentID[] // the id.version is the version we want to merge to the current component
  ): Promise<ComponentMergeStatus[]> {
    if (!this.currentLane && this.otherLane) {
      await this.importer.importObjectsFromMainIfExist(this.otherLane.toBitIds().toVersionLatest());
    }
    const componentStatusBeforeMergeAttempt = await mapSeries(bitIds, (id) =>
      this.getComponentStatusBeforeMergeAttempt(id)
    );
    // whether or not we need to import the gap between the common-snap and the other lane.
    // the common-snap itself we need anyway in order to get the files hash/content for checking conflicts.
    // the gap is needed only when the other side is a lane from a different scope than ours: its snaps
    // exist only on that lane's scope, and once merged they become part of our history, so our export
    // must push them onward (to each component's home scope when merging into main, or to the current
    // lane's scope). when the other side is main, its history is already on every component's home scope
    // and is never pushed by us (lane scopes are lean) — the VersionHistory (imported during the
    // pre-fetch) covers the divergence traversal.
    const shouldImportHistoryOfOtherLane =
      !this.options?.shouldSquash && // when squashing, no need for all history, only the head is going to be pushed
      Boolean(this.otherLane) &&
      this.otherLane?.scope !== this.currentLane?.scope;
    const toImport = componentStatusBeforeMergeAttempt
      .map((compStatus) => {
        if (!compStatus.divergeData) return [];
        const versionsToImport = [compStatus.divergeData.commonSnapBeforeDiverge];
        if (shouldImportHistoryOfOtherLane) {
          versionsToImport.push(...compStatus.divergeData.snapsOnTargetOnly);
        }
        return compact(versionsToImport).map((v) => compStatus.id.changeVersion(v.toString()));
      })
      .flat();
    const reason = shouldImportHistoryOfOtherLane
      ? `for filling the gap between the common-snap and the head of ${this.otherLane?.id() || 'main'}`
      : `for getting the common-snap between ${this.currentLane?.id() || 'main'} and ${this.otherLane?.id() || 'main'}`;
    await this.scope.legacyScope.scopeImporter.importWithoutDeps(ComponentIdList.fromArray(toImport), {
      lane: this.otherLane,
      cache: true,
      includeVersionHistory: false,
      reason,
    });

    const compStatusNotNeedMerge = componentStatusBeforeMergeAttempt.filter(
      (c) => !c.mergeProps
    ) as ComponentMergeStatus[];
    const compStatusNeedMerge = componentStatusBeforeMergeAttempt.filter((c) => c.mergeProps);

    const getComponentsStatusNeedMerge = async (): Promise<ComponentMergeStatus[]> => {
      const tmp = new Tmp(this.scope.legacyScope);
      try {
        const componentsStatus = await Promise.all(
          compStatusNeedMerge.map((compStatus) => this.getComponentMergeStatus(compStatus))
        );
        await tmp.clear();
        return componentsStatus;
      } catch (err: any) {
        await tmp.clear();
        throw err;
      }
    };
    const results = await getComponentsStatusNeedMerge();

    results.push(...compStatusNotNeedMerge);
    return results;
  }

  private async getComponentMergeStatus(
    componentMergeStatusBeforeMergeAttempt: ComponentMergeStatusBeforeMergeAttempt
  ) {
    const { id, divergeData, currentComponent, mergeProps } = componentMergeStatusBeforeMergeAttempt;
    if (!mergeProps) throw new Error(`getDivergedMergeStatus, mergeProps is missing for ${id.toString()}`);
    const { otherLaneHead, currentId, modelComponent } = mergeProps;
    const repo = this.scope.legacyScope.objects;
    if (!divergeData) throw new Error(`getDivergedMergeStatus, divergeData is missing for ${id.toString()}`);
    if (!currentComponent) throw new Error(`getDivergedMergeStatus, currentComponent is missing for ${id.toString()}`);

    const baseSnap = divergeData.commonSnapBeforeDiverge as unknown as Ref; // must be set when isTrueMerge
    this.logger.debug(`merging snaps details:
id:      ${id.toStringWithoutVersion()}
base:    ${baseSnap.toString()}
current: ${currentId.version}
other:   ${otherLaneHead.toString()}`);
    const baseComponent: Version = await modelComponent.loadVersion(baseSnap.toString(), repo);
    const otherComponent: Version = await modelComponent.loadVersion(otherLaneHead.toString(), repo);

    const currentLaneName = this.currentLane?.toLaneId().toString() || 'main';
    const otherLaneName = this.otherLane ? this.otherLane.toLaneId().toString() : DEFAULT_LANE;
    const currentLabel = `${currentId.version} (${currentLaneName === otherLaneName ? 'current' : currentLaneName})`;
    const otherLabel = `${otherLaneHead.toString()} (${
      otherLaneName === currentLaneName ? 'incoming' : otherLaneName
    })`;
    const workspaceIds = this.workspace?.listIds() || this.currentLane?.toComponentIds() || [];
    const configMerger = new ComponentConfigMerger(
      id.toStringWithoutVersion(),
      workspaceIds,
      this.otherLane,
      currentComponent.extensions,
      baseComponent.extensions,
      otherComponent.extensions,
      currentLabel,
      otherLabel,
      this.logger,
      this.options.mergeStrategy
    );
    const configMergeResult = configMerger.merge();

    const dataMergeResult = this.mergeExtensionsData(
      currentComponent.extensions,
      baseComponent.extensions,
      otherComponent.extensions
    );

    const mergeResults = await threeWayMerge({
      scope: this.scope.legacyScope,
      otherComponent,
      otherLabel,
      currentComponent,
      currentLabel,
      baseComponent,
    });
    // a workspace re-detects the dependencies from the merged files. a bare scope can't resolve imports, it merges the
    // resolved ones.
    const scopeDepsMerge = this.workspace
      ? undefined
      : await this.mergeDependenciesInScope(baseComponent, currentComponent, otherComponent, mergeResults);
    if (scopeDepsMerge?.failure) return { id, currentComponent, unchangedMessage: scopeDepsMerge.failure };
    return {
      currentComponent,
      id,
      mergeResults,
      divergeData,
      configMergeResult,
      dataMergeResult,
      dependenciesMergeResult: scopeDepsMerge?.dependenciesMergeResult,
    };
  }

  /**
   * merge the resolved dependencies of the sides, and correct them by the packages that the merged files import, see
   * mergeDependencies(). fails when the merged files import a package that no side has a version of.
   */
  private async mergeDependenciesInScope(
    baseComponent: Version,
    currentComponent: ConsumerComponent,
    otherComponent: Version,
    mergeResults: MergeResultsThreeWay
  ): Promise<{ dependenciesMergeResult?: DependenciesSnapshot; failure?: string }> {
    const other = getDependenciesOfVersion(otherComponent);
    // "theirs" with a file conflict takes all the files of other (see applyModifiedVersion), so the dependencies too
    if (mergeResults.hasConflicts && this.options.mergeStrategy === MergeOptions.theirs) {
      return { dependenciesMergeResult: other };
    }
    const base = getDependenciesOfVersion(baseComponent);
    const sideOf = (dependencies: DependenciesSnapshot, extensions: ExtensionDataList): SideOfMerge => ({
      dependencies,
      ignoredPackages: getIgnoredPackages(extensions),
    });
    const baseSide = sideOf(base, baseComponent.extensions);
    const currentSide = sideOf(currentComponent, currentComponent.extensions);
    const otherSide = sideOf(other, otherComponent.extensions);
    const imports = await this.getImportsOfMerge(baseComponent, currentComponent, otherComponent, mergeResults);
    if (imports) {
      const packagesWithoutVersion = getImportedPackagesWithoutVersion(
        baseSide,
        currentSide,
        otherSide,
        imports.merged.keys()
      );
      if (packagesWithoutVersion.length) {
        return {
          failure: `the merged files import ${packagesWithoutVersion.join(', ')}, which the merged dependencies policy doesn't ignore anymore ("-"), but no side has it as a dependency to take its version from. please merge in a workspace`,
        };
      }
    }
    const dependenciesMergeResult = mergeDependencies(
      base,
      currentComponent,
      other,
      this.options.mergeStrategy,
      this.currentLane?.toComponentIdsIncludeUpdateDependents(),
      imports && withoutIgnoredImports(imports, baseSide, currentSide, otherSide)
    );
    return { dependenciesMergeResult };
  }

  /**
   * the packages imported by the merged files and by the files of each side, see mergeDependencies().
   * undefined when the files have conflicts (the merge stops before the snap) or the imports of a file are unknown.
   */
  private async getImportsOfMerge(
    baseComponent: Version,
    currentComponent: ConsumerComponent,
    otherComponent: Version,
    mergeResults: MergeResultsThreeWay
  ): Promise<ImportsOfMerge | undefined> {
    if (mergeResults.hasConflicts) return undefined;
    const repo = this.scope.legacyScope.objects;
    const loadFiles = (version: Version) =>
      Promise.all(version.files.map((file) => SourceFile.loadFromSourceFileModel(file, repo)));
    const toFileContents = (files: SourceFile[]): FileContent[] =>
      files.map((file) => ({ relativePath: pathNormalizeToLinux(file.relative), content: file.contents.toString() }));
    const [baseFiles, otherFiles] = await Promise.all([loadFiles(baseComponent), loadFiles(otherComponent)]);
    // the files and the aspects-data that are snapped, see MergingMain.applyVersion. "theirs" applies the merge to the
    // files of other and snaps the aspects-data of other. otherwise, it's currentComponent, whose aspects-data is
    // already merged in a lane merge (see mergeExtensionsData).
    const isTheirs = this.options.mergeStrategy === MergeOptions.theirs;
    const filesToMergeInto = isTheirs ? otherFiles : currentComponent.files;
    const { modifiedFiles } = applyModifiedVersion(filesToMergeInto, mergeResults, this.options.mergeStrategy);
    const snappedExtensions = isTheirs ? otherComponent.extensions : currentComponent.extensions;
    const devFilesData = snappedExtensions.findCoreExtension(DevFilesAspect.id)?.data || {};
    const devPatterns: string[] = Object.values(devFilesData.devPatterns || {}).flat() as string[];
    const devFiles = new Set(Object.values(devFilesData.devFiles || {}).flat() as string[]);
    const { includePatterns, excludePatterns } = splitPatterns(devPatterns);
    const isDevFile = (relativePath: string) =>
      devFiles.has(relativePath) || matchPatterns(relativePath, includePatterns, excludePatterns);
    const cache: ImportsCache = new Map();
    const importsAreUnknown = () => {
      this.logger.debug(
        `the imports of ${currentComponent.id.toString()} are unknown, its dependencies are not corrected`
      );
      return undefined;
    };
    const merged = await detectImportedPackages(toFileContents(modifiedFiles), isDevFile, cache);
    if (!merged) return importsAreUnknown();
    const sides = await Promise.all(
      [baseFiles, currentComponent.files, otherFiles].map((files) =>
        detectImportedPackages(toFileContents(files), undefined, cache)
      )
    );
    if (sides.some((side) => !side)) return importsAreUnknown();
    return { merged, sides: new Set(sides.flatMap((side) => [...side!.keys()])) };
  }

  private mergeExtensionsData(
    currentExtensions: ExtensionDataList,
    baseExtensions: ExtensionDataList,
    otherExtensions: ExtensionDataList
  ): DataMergeResult {
    if (!this.options.shouldMergeAspectsData) {
      return {};
    }
    const conflictedAspects: { [extId: string]: string } = {}; // extId => reason
    // these aspects handled separately
    const aspectsToSkip = [DependencyResolverAspect.id, BuilderAspect.id];
    currentExtensions.forEach((currentExtension) => {
      if (aspectsToSkip.includes(currentExtension.stringId)) {
        return;
      }
      const baseExtension = baseExtensions.findExtension(currentExtension.idWithoutVersion, true);
      const otherExtension = otherExtensions.findExtension(currentExtension.idWithoutVersion, true);
      if (!otherExtension) {
        conflictedAspects[currentExtension.stringId] = 'missing in other';
        return;
      }
      // check whether the version is different.
      if (currentExtension.extensionId?.version !== otherExtension.extensionId?.version) {
        if (baseExtension?.extensionId?.version === otherExtension.extensionId?.version) {
          // ext version has changed in current. we're good.
          return;
        }
        conflictedAspects[currentExtension.stringId] =
          `version changed. base: ${baseExtension?.extensionId?.version}, other: ${otherExtension.extensionId?.version}`;
        return;
      }
      if (isEqual(currentExtension.data, otherExtension.data)) return;
      if (!baseExtension) {
        conflictedAspects[currentExtension.stringId] = 'no base-version. conflicted in data';
        return;
      }
      if (isEqual(baseExtension.data, otherExtension.data)) {
        return; // changed in current. leave it.
      }
      if (isEqual(baseExtension.data, currentExtension.data)) {
        // changed in other. copy it.
        currentExtension.data = otherExtension.data;
        return;
      }
      // changed in both. conflict.
      conflictedAspects[currentExtension.stringId] = 'conflicted in data since base-version';
    });
    otherExtensions.forEach((otherExtension) => {
      if (!currentExtensions.findExtension(otherExtension.idWithoutVersion, true)) {
        conflictedAspects[otherExtension.stringId] = 'missing in current';
      }
    });

    return { conflictedAspects };
  }

  private returnUnmerged(
    id: ComponentID,
    msg: string,
    unmergedLegitimately = false
  ): ComponentMergeStatusBeforeMergeAttempt {
    const componentStatus: ComponentMergeStatusBeforeMergeAttempt = { id };
    componentStatus.unchangedMessage = msg;
    componentStatus.unchangedLegitimately = unmergedLegitimately;
    return componentStatus;
  }

  // eslint-disable-next-line complexity
  private async getComponentStatusBeforeMergeAttempt(
    id: ComponentID // the id.version is the version we want to merge to the current component
  ): Promise<ComponentMergeStatusBeforeMergeAttempt> {
    const consumer = this.workspace?.consumer;
    const componentStatus: ComponentMergeStatusBeforeMergeAttempt = { id };
    const modelComponent = await this.scope.legacyScope.getModelComponentIfExist(id);
    if (!modelComponent) {
      return this.returnUnmerged(
        id,
        `component ${id.toString()} is on the lane/main but its objects were not found, please re-import the lane`
      );
    }
    const unmerged = this.scope.legacyScope.objects.unmergedComponents.getEntry(id);
    if (unmerged) {
      return this.returnUnmerged(
        id,
        `component ${id.toStringWithoutVersion()} is in during-merge state a previous merge, please snap/tag it first (or use bit merge --resolve/--abort/ bit lane merge-abort)`
      );
    }
    const repo = this.scope.legacyScope.objects;
    const version = id.version as string;
    const otherLaneHead = modelComponent.getRef(version);
    const existingBitMapId = consumer?.bitMap.getComponentIdIfExist(id, { ignoreVersion: true });
    const componentOnOther: Version = await modelComponent.loadVersion(version, this.scope.legacyScope.objects);
    // include hidden lane.updateDependents — when merging main into a lane, a hidden cascade
    // entry is the lane-side baseline for the 3-way merge. Without this the merge engine treats
    // the comp as "not on the lane" and produces a snap with parents=[mainHead], losing the
    // ancestral link to the lane's hidden head.
    const idOnCurrentLane =
      this.currentLane?.getComponent(id) || this.currentLane?.getUpdateDependentAsLaneComponent(id);

    if (componentOnOther.isRemoved()) {
      // if exist in current lane, we want the current lane to get the soft-remove update.
      // or if it was removed with --update-main, we want to merge it so then main will get the update.
      // (unless this component does not exist on main, in which case, we don't want to merge it).
      const shouldMerge = idOnCurrentLane || (componentOnOther.shouldRemoveFromMain() && modelComponent.head);
      if (shouldMerge) {
        // remove the component from the workspace if exist.
        componentStatus.shouldBeRemoved = true;
      } else {
        // on main, don't merge soft-removed components unless it's marked with removeOnMain.
        // on lane, if it's not part of the current lane, don't merge it.
        return this.returnUnmerged(id, compHasBeenRemovedMsg, true);
      }
    }
    const getCurrentId = () => {
      if (existingBitMapId) return existingBitMapId;
      if (this.currentLane) {
        if (!idOnCurrentLane) return null;
        return idOnCurrentLane.id.changeVersion(idOnCurrentLane.head.toString());
      }
      // it's on main
      const head = modelComponent.getHeadAsTagIfExist();
      if (head) {
        return id.changeVersion(head);
      }
      return null;
    };
    const currentId = getCurrentId();
    if (!currentId) {
      const divergeData = await getDivergeData({ repo, modelComponent, targetHead: otherLaneHead, throws: false });
      return { ...componentStatus, componentFromModel: componentOnOther, divergeData };
    }
    const componentMap = consumer?.bitMap.getComponentIfExist(currentId, { ignoreVersion: true });
    const isLocallyRemoved = componentMap?.isRemoved();
    if (isLocallyRemoved) {
      return this.returnUnmerged(
        id,
        `component is locally deleted, please snap and export first or undo by bit recover`
      );
    }
    const getCurrentComponent = async () => {
      if (existingBitMapId && this.workspace) {
        const currentWorkspaceComp = await this.workspace.get(existingBitMapId);
        return currentWorkspaceComp.state._consumer;
      }
      return this.scope.legacyScope.getConsumerComponent(currentId);
    };
    const currentComponent = await getCurrentComponent();
    if (currentComponent.isRemoved()) {
      // we have a few options:
      // 1. "other" is main.
      // 1.a. it was deleted on the lane with --update-main. in this case, we need to merge because eventually we need this component
      // to be merged to main with the "removed: true".
      // 1.b. it was deleted on the lane without --update-main. in this case, we don't care what happens on main,
      // we want the component to stay deleted on this lane. (even when main is ahead, we don't want to merge it).
      // 2. other is ahead. in this case, other recovered the component. so we can continue with the merge.
      // it is possible that it is diverged, in which case, still continue with the merge, and later on, the
      // merge-config will show a config conflict of the remove aspect.
      // 3. other is not ahead. in this case, just ignore this component, no point to merge it, we want it removed.
      const isRemovedOnMain =
        currentComponent.extensions.findCoreExtension('teambit.component/remove')?.config?.removeOnMain;
      const divergeData = await getDivergeData({ repo, modelComponent, targetHead: otherLaneHead, throws: false });
      const isTargetNotAhead = !divergeData.err && !divergeData.isTargetAhead();
      const shouldIgnore = this.otherLane
        ? isTargetNotAhead // option #2 and #3 above
        : !isRemovedOnMain; // it's main. option #1 above.
      if (shouldIgnore) {
        return this.returnUnmerged(id, compHasBeenRemovedMsg, true);
      }
    }

    const isModified = async (): Promise<undefined | 'code' | 'config'> => {
      if (!consumer || !this.workspace) return undefined;
      const componentModificationStatus = await this.workspace.getComponentStatusById(currentComponent.id);
      if (!componentModificationStatus.modified) return undefined;
      if (!existingBitMapId) return undefined;
      const baseComponent = await modelComponent.loadVersion(
        existingBitMapId.version as string,
        consumer.scope.objects
      );
      const isSourceCodeModified = await consumer.isComponentSourceCodeModified(baseComponent, currentComponent);
      if (isSourceCodeModified) return 'code';
      return 'config';
    };

    const modifiedType = await isModified();
    if (modifiedType === 'config' && !this.options?.ignoreConfigChanges) {
      return this.returnUnmerged(
        id,
        `component has config changes, please snap/tag it first. alternatively, use --ignore-config-changes flag to bypass`
      );
    }
    if (modifiedType === 'code') {
      return this.returnUnmerged(id, `component is modified, please snap/tag it first`);
    }

    if (!otherLaneHead) {
      throw new Error(`merging: unable finding a hash for the version ${version} of ${id.toString()}`);
    }
    const divergeData = await getDivergeData({
      repo,
      modelComponent,
      sourceHead: this.workspace ? undefined : modelComponent.getRef(currentId.version as string), // not sure if needs to check for this.workspace
      targetHead: otherLaneHead,
      throws: false,
    });
    if (divergeData.err) {
      if (!(divergeData.err instanceof NoCommonSnap) || !this.options?.resolveUnrelated) {
        return this.returnUnmerged(id, `unable to traverse history. error: ${divergeData.err.message}`);
      }
      return this.handleNoCommonSnap(
        modelComponent,
        id,
        otherLaneHead,
        currentComponent,
        componentOnOther,
        divergeData
      );
    }
    if (this.options.detachHead && divergeData.commonSnapBeforeDiverge) {
      // just override with the model data
      const commonSnapId = id.changeVersion(divergeData.commonSnapBeforeDiverge.toString());
      const commonSnapComp = await this.scope.legacyScope.getConsumerComponent(commonSnapId);
      return {
        ...componentStatus,
        currentComponent: commonSnapComp,
        componentFromModel: componentOnOther,
        divergeData,
      };
    }
    if (!divergeData.isDiverged()) {
      if (divergeData.isSourceAhead()) {
        // component is ahead nothing to merge.
        return this.returnUnmerged(id, compIsAlreadyMergedMsg, true);
      }
      if (!divergeData.isTargetAhead()) {
        // we know that localHead and remoteHead are set, so if none of them is ahead they must be equal
        return this.returnUnmerged(id, compIsAlreadyMergedMsg, true);
      }
      // target is ahead.
      if (!this.options.handleTargetAheadAsDiverged || !divergeData.commonSnapBeforeDiverge) {
        // just override with the model data
        return {
          ...componentStatus,
          currentComponent,
          componentFromModel: componentOnOther,
          divergeData,
        };
      }
      // target is ahead and we want to treat it as diverged, continue.
    }

    // it's diverged and needs merge operation
    const mergeProps = {
      otherLaneHead,
      currentId,
      modelComponent,
    };

    return { ...componentStatus, currentComponent, mergeProps, divergeData };
  }

  private async handleNoCommonSnap(
    modelComponent: ModelComponent,
    id: ComponentID,
    otherLaneHead: Ref,
    currentComponent: ConsumerComponent,
    componentOnOther?: Version,
    divergeData?: SnapsDistance
  ): Promise<ComponentMergeStatusBeforeMergeAttempt> {
    let { resolveUnrelated } = this.options || {};
    if (currentComponent.isRemoved()) {
      resolveUnrelated = 'theirs';
    }
    if (!resolveUnrelated) throw new Error(`handleNoCommonSnap expects resolveUnrelated to be set`);
    const repo = this.scope.legacyScope.objects;
    const mainHead = modelComponent.head;

    const returnAccordingToOurs = (
      headToSaveInLane: Ref,
      unrelatedHead: Ref,
      unrelatedLaneId: LaneId
    ): ComponentMergeStatusBeforeMergeAttempt => {
      return {
        currentComponent,
        id,
        divergeData,
        resolvedUnrelated: {
          strategy: 'ours',
          headOnCurrentLane: headToSaveInLane,
          unrelatedHead,
          unrelatedLaneId,
        },
      };
    };
    const returnAccordingToTheirs = (
      resolvedRef: Ref,
      unrelatedHeadRef: Ref,
      unrelatedLaneId: LaneId
    ): ComponentMergeStatusBeforeMergeAttempt => {
      // just override with the model data
      return {
        currentComponent,
        componentFromModel: componentOnOther,
        id,
        divergeData,
        resolvedUnrelated: {
          strategy: 'theirs',
          headOnCurrentLane: resolvedRef,
          unrelatedHead: unrelatedHeadRef,
          unrelatedLaneId,
        },
      };
    };

    const currentVersionRef = modelComponent.getRef(currentComponent.id.version as string);
    if (!currentVersionRef)
      throw new Error(
        `handleNoCommonSnap, unable to get ref of current version "${
          currentComponent.id.version
        }" for "${id.toString()}"`
      );
    const otherVersionRef = modelComponent.getRef(id.version as string);
    if (!otherVersionRef)
      throw new Error(`handleNoCommonSnap, unable to get ref of other version "${id.version}" for "${id.toString()}"`);

    if (mainHead) {
      const hasResolvedFromMain = async (hashToCompare: Ref | null) => {
        const divergeDataFromMain = await getDivergeData({
          repo,
          modelComponent,
          sourceHead: hashToCompare,
          targetHead: mainHead,
          throws: false,
        });
        if (!divergeDataFromMain.err) return true;
        return !(divergeDataFromMain.err instanceof NoCommonSnap);
      };
      const hasResolvedLocally = await hasResolvedFromMain(modelComponent.getHeadRegardlessOfLane() as Ref);
      const hasResolvedRemotely = await hasResolvedFromMain(otherLaneHead);
      if (!hasResolvedLocally && !hasResolvedRemotely) {
        return this.returnUnmerged(
          id,
          `unable to traverse ${currentComponent.id.toString()} history. the main-head ${mainHead.toString()} doesn't appear in both lanes.
it was probably created in each lane separately and it also exists on main. please merge main first to one of these lanes`
        );
      }
      const refToSaveInLane = hasResolvedLocally ? currentVersionRef : otherVersionRef;
      const unrelatedHeadRef = hasResolvedLocally ? otherVersionRef : currentVersionRef;
      if (resolveUnrelated === 'ours') {
        return returnAccordingToOurs(refToSaveInLane, unrelatedHeadRef, this.currentLane?.toLaneId() as LaneId);
      }
      if (resolveUnrelated === 'theirs') {
        return returnAccordingToTheirs(refToSaveInLane, unrelatedHeadRef, this.currentLane?.toLaneId() as LaneId);
      }
      throw new Error(
        `unsupported strategy "${resolveUnrelated}" of resolve-unrelated. supported strategies are: [ours, theirs]`
      );
    }

    const refToSaveInLane = resolveUnrelated === 'ours' ? currentVersionRef : otherVersionRef;
    const unrelatedHeadRef = resolveUnrelated === 'ours' ? otherVersionRef : currentVersionRef;
    if (resolveUnrelated === 'ours') {
      return returnAccordingToOurs(refToSaveInLane, unrelatedHeadRef, this.otherLane?.toLaneId() as LaneId);
    }
    if (resolveUnrelated === 'theirs') {
      return returnAccordingToTheirs(refToSaveInLane, unrelatedHeadRef, this.currentLane?.toLaneId() as LaneId);
    }
    throw new Error(
      `unsupported strategy "${resolveUnrelated}" of resolve-unrelated. supported strategies are: [ours, theirs]`
    );
  }
}

/**
 * the packages that the dependencies policy of a component ignores ("-"). the policy of a Version is the resolved one
 * (env, aspects and config), see DependencyResolverMain.mergeVariantPolicies().
 */
function getIgnoredPackages(extensions: ExtensionDataList): Set<string> {
  const policy: VariantPolicyEntry[] = extensions.findCoreExtension(DependencyResolverAspect.id)?.data.policy || [];
  return new Set(
    policy.filter((entry) => entry.value.version === MANUALLY_REMOVE_DEPENDENCY).map((entry) => entry.dependencyId)
  );
}
