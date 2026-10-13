import type { Workspace } from '@teambit/workspace';
import mapSeries from 'p-map-series';
import type { ComponentID } from '@teambit/component-id';
import { ComponentIdList } from '@teambit/component-id';
import type { LaneId } from '@teambit/lane-id';
import { DEFAULT_LANE } from '@teambit/lane-id';
import type { SnapsDistance } from '@teambit/component.snap-distance';
import { getDivergeData } from '@teambit/component.snap-distance';
import {
  type Lane,
  type ModelComponent,
  type Ref,
  type Version,
  isRustSnapshotOperation,
  withRustMergeTransactionOperation,
  withRustMergeTransactionJournal,
  completeRustMergeTransactionPhase,
  isRustMergeTransactionOperation,
  registerRustMergeStatusProvider,
  canUseRustMergeStatusProvider,
  captureRustMergeStatusProvider,
  beginRustMergeStatus,
  observeRustMergeStatus,
  captureRustMergeDivergence,
  type RustMergeStatusCursor,
  type RustMergeStatusResult,
  hasRustSnapshotTransactionClassFields,
} from '@teambit/objects';
import { NoCommonSnap, Tmp } from '@teambit/legacy.scope';
import type { ConsumerComponent } from '@teambit/legacy.consumer-component';
import type { ImporterMain } from '@teambit/importer';
import type { Logger } from '@teambit/logger';
import { compact, isEqual } from 'lodash';
import { ComponentConfigMerger, tryRustComponentConfigMerge } from '@teambit/config-merger';
import type { ScopeMain } from '@teambit/scope';
import type { MergeStrategy } from '@teambit/component.modules.merge-helper';
import { threeWayMerge, withRustMergeBodyPlanIndex } from '@teambit/component.modules.merge-helper';
import type { ComponentMergeStatus, ComponentMergeStatusBeforeMergeAttempt } from './merging.main.runtime';
import type { ExtensionDataList } from '@teambit/legacy.extension-data';
import { DependencyResolverAspect } from '@teambit/dependency-resolver';
import { BuilderAspect } from '@teambit/builder';

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
import { compHasBeenRemovedMsg } from './merge-messages';
export { compHasBeenRemovedMsg } from './merge-messages';
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
    if (process.env.BIT_RUST_CLIENT_VCS !== 'on' || !canUseRustMergeStatusProvider(this, bitIds))
      return this.getStatusWithinOperation(bitIds);
    return withRustMergeTransactionOperation(() =>
      withRustMergeTransactionJournal(
        {
          mode: 'status',
          count: bitIds.length,
          importMain: Boolean(!this.currentLane && this.otherLane),
        },
        () => this.getStatusWithinOperation(bitIds)
      )
    );
  }

  private async getStatusWithinOperation(bitIds: ComponentID[]): Promise<ComponentMergeStatus[]> {
    if (!this.currentLane && this.otherLane) {
      await this.importer.importObjectsFromMainIfExist(this.otherLane.toBitIds().toVersionLatest());
      if (isRustMergeTransactionOperation()) await completeRustMergeTransactionPhase('importMain');
    }
    const componentStatusBeforeMergeAttempt = await mapSeries(bitIds, async (id, index) => {
      const result = await this.getComponentStatusBeforeMergeAttempt(id, index);
      if (isRustMergeTransactionOperation()) await completeRustMergeTransactionPhase('status');
      return result;
    });
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

    if (isRustMergeTransactionOperation())
      await completeRustMergeTransactionPhase('importGap', 1, compStatusNeedMerge.length);
    const getComponentsStatusNeedMerge = async (): Promise<ComponentMergeStatus[]> => {
      const tmp = new Tmp(this.scope.legacyScope);
      try {
        const componentsStatus = await Promise.all(
          compStatusNeedMerge.map((compStatus, index) =>
            isRustMergeTransactionOperation()
              ? withRustMergeBodyPlanIndex(index, () => this.getComponentMergeStatus(compStatus))
              : this.getComponentMergeStatus(compStatus)
          )
        );
        if (isRustMergeTransactionOperation()) await completeRustMergeTransactionPhase('plans');
        await tmp.clear();
        if (isRustMergeTransactionOperation()) await completeRustMergeTransactionPhase('clearTemps');
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
    const nativeEligible = isRustSnapshotOperation() && canMergeConfigNatively(this);
    const shouldMergeAspectsData = nativeEligible ? Boolean(this.options.shouldMergeAspectsData) : false;
    const native = nativeEligible
      ? await tryRustComponentConfigMerge(
          configMerger,
          shouldMergeAspectsData,
          () => canMergeConfigNatively(this) && Boolean(this.options.shouldMergeAspectsData) === shouldMergeAspectsData
        )
      : undefined;
    const configMergeResult = native ? native.configMergeResult : configMerger.merge();

    const dataMergeResult = native
      ? native.dataMergeResult
      : this.mergeExtensionsData(currentComponent.extensions, baseComponent.extensions, otherComponent.extensions);

    const mergeResults = await threeWayMerge({
      scope: this.scope.legacyScope,
      otherComponent,
      otherLabel,
      currentComponent,
      currentLabel,
      baseComponent,
    });
    return {
      currentComponent,
      id,
      mergeResults,
      divergeData,
      configMergeResult,
      dataMergeResult,
    };
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
    id: ComponentID, // the id.version is the version we want to merge to the current component
    index = 0
  ): Promise<ComponentMergeStatusBeforeMergeAttempt> {
    const consumer = this.workspace?.consumer;
    const componentStatus: ComponentMergeStatusBeforeMergeAttempt = { id };
    const captured = isRustMergeTransactionOperation() ? captureRustMergeStatusProvider(this, id) : undefined;
    let cursor = captured
      ? await beginRustMergeStatus({
          index,
          id: captured.id,
          idWithoutVersion: captured.idWithoutVersion,
          hasConsumer: Boolean(consumer),
          hasWorkspace: Boolean(this.workspace),
        })
      : undefined;
    const observe = async (stage: Parameters<typeof observeRustMergeStatus>[1], value: object) => {
      if (!cursor || !captured?.fresh()) {
        cursor = undefined;
        return undefined;
      }
      const next = await observeRustMergeStatus(cursor, stage, value);
      if (!captured.fresh()) {
        cursor = undefined;
        return undefined;
      }
      return next?.result;
    };
    const unchanged = (result: RustMergeStatusResult | undefined) =>
      result?.action === 'unchanged' ? this.returnUnmerged(id, result.message!, result.legitimate) : undefined;
    const modelComponent = await this.scope.legacyScope.getModelComponentIfExist(id);
    const modelResult = cursor && unchanged(await observe('model', { present: Boolean(modelComponent) }));
    if (modelResult) return modelResult;
    if (!modelComponent) {
      return this.returnUnmerged(
        id,
        `component ${id.toString()} is on the lane/main but its objects were not found, please re-import the lane`
      );
    }
    const unmerged = this.scope.legacyScope.objects.unmergedComponents.getEntry(id);
    const unmergedResult = cursor && unchanged(await observe('unmerged', { present: Boolean(unmerged) }));
    if (unmergedResult) return unmergedResult;
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

    const incomingRemoved = componentOnOther.isRemoved();
    const incomingResult =
      cursor &&
      unchanged(
        await observe('incoming', {
          removed: Boolean(incomingRemoved),
          onLane: Boolean(idOnCurrentLane),
          bitmapPresent: Boolean(existingBitMapId),
          currentLanePresent: Boolean(this.currentLane),
        })
      );
    if (incomingResult) return incomingResult;
    if (incomingRemoved) {
      // if exist in current lane, we want the current lane to get the soft-remove update.
      // or if it was removed with --update-main, we want to merge it so then main will get the update.
      // (unless this component does not exist on main, in which case, we don't want to merge it).
      const removeOnMain = !idOnCurrentLane && componentOnOther.shouldRemoveFromMain();
      const mainHead = removeOnMain && modelComponent.head;
      const shouldMerge = idOnCurrentLane || (removeOnMain && mainHead);
      if (cursor && !idOnCurrentLane) {
        const removalResult = unchanged(await observe('removeOnMain', { removeOnMain: Boolean(removeOnMain) }));
        if (removalResult) return removalResult;
        if (removeOnMain) {
          const headResult = unchanged(await observe('mainHead', { present: Boolean(mainHead) }));
          if (headResult) return headResult;
        }
      }
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
    const selector = cursor?.directive?.observe === 'currentId' ? cursor.directive.selector : undefined;
    const currentId = selector === 'bitmap' ? existingBitMapId : selector === 'none' ? null : getCurrentId();
    if (cursor) await observe('currentId', { present: Boolean(currentId) });
    if (!currentId) {
      const divergeData = await getDivergeData({ repo, modelComponent, targetHead: otherLaneHead, throws: false });
      if (cursor) await observe('divergence', {});
      return { ...componentStatus, componentFromModel: componentOnOther, divergeData };
    }
    const componentMap = consumer?.bitMap.getComponentIfExist(currentId, { ignoreVersion: true });
    const isLocallyRemoved = componentMap?.isRemoved();
    const localResult = cursor && unchanged(await observe('locallyRemoved', { removed: Boolean(isLocallyRemoved) }));
    if (localResult) return localResult;
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
    const currentRemoved = currentComponent.isRemoved();
    const currentResult = cursor && unchanged(await observe('current', { removed: Boolean(currentRemoved) }));
    if (currentResult) return currentResult;
    if (currentRemoved) {
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
      const distance = cursor && captureRustMergeDivergence(divergeData);
      const isTargetNotAhead = !divergeData.err && !divergeData.isTargetAhead();
      if (cursor && distance) {
        await observe('removedMain', { removeOnMain: Boolean(isRemovedOnMain) });
        if (distance.fresh()) {
          const removedResult = unchanged(
            await observe('removedDivergence', {
              error: Boolean(divergeData.err),
              targetAhead: distance.targetAhead,
              otherLanePresent: Boolean(this.otherLane),
            })
          );
          if (removedResult && distance.fresh()) return removedResult;
        } else cursor = undefined;
      } else cursor = undefined;
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
    const modificationResult =
      cursor &&
      unchanged(
        await observe('modified', {
          ...(modifiedType === undefined ? {} : { type: modifiedType }),
          ignoreConfigChanges: Boolean(this.options?.ignoreConfigChanges),
        })
      );
    if (modificationResult) return modificationResult;
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
    let distance = cursor && captureRustMergeDivergence(divergeData);
    // Keep the original public typed-error observation once, before the private branch plan.
    const noCommon = divergeData.err ? divergeData.err instanceof NoCommonSnap : false;
    if (noCommon && !hasRustSnapshotTransactionClassFields(divergeData.err!, 'MergeNoCommonSnap', ['message']))
      distance = undefined;
    const selection =
      cursor && distance
        ? await observe('divergence', {
            sourceAhead: distance.sourceAhead,
            targetAhead: distance.targetAhead,
            diverged: distance.diverged,
            ...(distance.common ? { common: distance.common } : {}),
            ...(distance.error
              ? {
                  error: {
                    kind: noCommon ? 'noCommon' : 'other',
                    message: Object.getOwnPropertyDescriptor(distance.error, 'message')!.value,
                  },
                }
              : {}),
            resolveUnrelated: this.options.resolveUnrelated,
            detachHead: Boolean(this.options.detachHead),
            handleTargetAheadAsDiverged: Boolean(this.options.handleTargetAheadAsDiverged),
          })
        : undefined;
    if (distance && !distance.fresh()) cursor = undefined;
    const chosen = cursor ? selection : undefined;
    const divergenceFailure = unchanged(chosen);
    if (divergenceFailure) return divergenceFailure;
    if (divergeData.err) {
      if (!noCommon || !this.options?.resolveUnrelated) {
        return this.returnUnmerged(id, `unable to traverse history. error: ${divergeData.err.message}`);
      }
      return this.handleNoCommonSnap(
        modelComponent,
        id,
        otherLaneHead,
        currentComponent,
        componentOnOther,
        divergeData,
        cursor && captured?.fresh() ? { cursor, fresh: captured.fresh } : undefined
      );
    }
    if (
      (chosen?.action === 'detach' || (chosen === undefined && this.options.detachHead)) &&
      divergeData.commonSnapBeforeDiverge
    ) {
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
    if (chosen?.action === 'target')
      return { ...componentStatus, currentComponent, componentFromModel: componentOnOther, divergeData };
    if (chosen === undefined && !divergeData.isDiverged()) {
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
    divergeData?: SnapsDistance,
    native?: { cursor: RustMergeStatusCursor; fresh: () => boolean }
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
      let selection: RustMergeStatusResult | undefined;
      if (native?.fresh() && (resolveUnrelated === 'ours' || resolveUnrelated === 'theirs')) {
        const state = await observeRustMergeStatus(native.cursor, 'unrelated', {
          strategy: resolveUnrelated,
          hasMain: true,
          hasResolvedLocally,
          hasResolvedRemotely,
        });
        if (native.fresh()) selection = state?.result;
      }
      if (!hasResolvedLocally && !hasResolvedRemotely) {
        const message = `unable to traverse ${currentComponent.id.toString()} history. the main-head ${mainHead.toString()} doesn't appear in both lanes.
it was probably created in each lane separately and it also exists on main. please merge main first to one of these lanes`;
        if (native?.fresh()) await observeRustMergeStatus(native.cursor, 'unrelatedFailure', { message });
        return this.returnUnmerged(id, message);
      }
      const refToSaveInLane = selection?.unrelated
        ? selection.unrelated.head === 'current'
          ? currentVersionRef
          : otherVersionRef
        : hasResolvedLocally
          ? currentVersionRef
          : otherVersionRef;
      const unrelatedHeadRef = selection?.unrelated
        ? selection.unrelated.unrelatedHead === 'current'
          ? currentVersionRef
          : otherVersionRef
        : hasResolvedLocally
          ? otherVersionRef
          : currentVersionRef;
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

    let selection: RustMergeStatusResult | undefined;
    if (native?.fresh() && (resolveUnrelated === 'ours' || resolveUnrelated === 'theirs')) {
      const state = await observeRustMergeStatus(native.cursor, 'unrelated', {
        strategy: resolveUnrelated,
        hasMain: false,
      });
      if (native.fresh()) selection = state?.result;
    }
    const refToSaveInLane = selection?.unrelated
      ? selection.unrelated.head === 'current'
        ? currentVersionRef
        : otherVersionRef
      : resolveUnrelated === 'ours'
        ? currentVersionRef
        : otherVersionRef;
    const unrelatedHeadRef = selection?.unrelated
      ? selection.unrelated.unrelatedHead === 'current'
        ? currentVersionRef
        : otherVersionRef
      : resolveUnrelated === 'ours'
        ? otherVersionRef
        : currentVersionRef;
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

const canonicalMergeExtensionsData = (MergeStatusProvider.prototype as any).mergeExtensionsData;
function canMergeConfigNatively(provider: MergeStatusProvider): boolean {
  if (
    Object.getPrototypeOf(provider) !== MergeStatusProvider.prototype ||
    Object.getOwnPropertyDescriptor(provider, 'mergeExtensionsData')
  )
    return false;
  if (
    Object.getOwnPropertyDescriptor(MergeStatusProvider.prototype, 'mergeExtensionsData')?.value !==
    canonicalMergeExtensionsData
  )
    return false;
  const options = Object.getOwnPropertyDescriptor(provider, 'options');
  if (!options || !('value' in options) || !options.value || Object.getPrototypeOf(options.value) !== Object.prototype)
    return false;
  return Object.values(Object.getOwnPropertyDescriptors(options.value)).every((descriptor) => 'value' in descriptor);
}

registerRustMergeStatusProvider(MergeStatusProvider);
