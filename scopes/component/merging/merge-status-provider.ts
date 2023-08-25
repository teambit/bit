import { Workspace } from '@teambit/workspace';
import { MergeStrategy } from '@teambit/legacy/dist/consumer/versions-ops/merge-version';
import mapSeries from 'p-map-series';
import { BitId, BitIds } from '@teambit/legacy/dist/bit-id';
import { DEFAULT_LANE, LaneId } from '@teambit/lane-id';
import { getDivergeData } from '@teambit/legacy/dist/scope/component-ops/get-diverge-data';
import { Lane, ModelComponent, Version } from '@teambit/legacy/dist/scope/models';
import { Ref } from '@teambit/legacy/dist/scope/objects';
import { Tmp } from '@teambit/legacy/dist/scope/repositories';
import ConsumerComponent from '@teambit/legacy/dist/consumer/component/consumer-component';
import { ImporterMain } from '@teambit/importer';
import { Logger } from '@teambit/logger';
import { compact } from 'lodash';
import threeWayMerge from '@teambit/legacy/dist/consumer/versions-ops/merge-version/three-way-merge';
import { SnapsDistance } from '@teambit/legacy/dist/scope/component-ops/snaps-distance';
import { NoCommonSnap } from '@teambit/legacy/dist/scope/exceptions/no-common-snap';
import { ConfigMerger } from './config-merger';
import { ComponentMergeStatus, ComponentMergeStatusBeforeMergeAttempt } from './merging.main.runtime';

export class MergeStatusProvider {
  constructor(
    private workspace: Workspace,
    private logger: Logger,
    private importer: ImporterMain,
    private currentLane?: Lane, // currently checked out lane. if on main, then it's null.
    private otherLane?: Lane, // the lane we want to merged to our lane. (null if it's "main").
    private options?: { resolveUnrelated?: MergeStrategy; ignoreConfigChanges?: boolean }
  ) {}

  async getStatus(
    bitIds: BitId[] // the id.version is the version we want to merge to the current component
  ): Promise<ComponentMergeStatus[]> {
    if (!this.currentLane && this.otherLane) {
      await this.importer.importObjectsFromMainIfExist(this.otherLane.toBitIds().toVersionLatest());
    }
    const componentStatusBeforeMergeAttempt = await mapSeries(bitIds, (id) =>
      this.getComponentStatusBeforeMergeAttempt(id)
    );
    const toImport = componentStatusBeforeMergeAttempt
      .map((compStatus) => {
        if (!compStatus.divergeData) return [];
        const versionsToImport = compact([
          ...compStatus.divergeData.snapsOnTargetOnly,
          compStatus.divergeData.commonSnapBeforeDiverge,
        ]);
        return versionsToImport.map((v) => compStatus.id.changeVersion(v.toString()));
      })
      .flat();

    await this.workspace.consumer.scope.scopeImporter.importWithoutDeps(BitIds.fromArray(toImport), {
      lane: this.otherLane,
      cache: true,
      includeVersionHistory: false,
    });

    const compStatusNotNeedMerge = componentStatusBeforeMergeAttempt.filter(
      (c) => !c.mergeProps
    ) as ComponentMergeStatus[];
    const compStatusNeedMerge = componentStatusBeforeMergeAttempt.filter((c) => c.mergeProps);

    const getComponentsStatusNeedMerge = async (): Promise<ComponentMergeStatus[]> => {
      const tmp = new Tmp(this.workspace.consumer.scope);
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
    const repo = this.workspace.consumer.scope.objects;
    if (!divergeData) throw new Error(`getDivergedMergeStatus, divergeData is missing for ${id.toString()}`);
    if (!currentComponent) throw new Error(`getDivergedMergeStatus, currentComponent is missing for ${id.toString()}`);

    const baseSnap = divergeData.commonSnapBeforeDiverge as Ref; // must be set when isTrueMerge
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
    const workspaceIds = await this.workspace.listIds();
    const configMerger = new ConfigMerger(
      id.toStringWithoutVersion(),
      workspaceIds,
      this.otherLane,
      currentComponent.extensions,
      baseComponent.extensions,
      otherComponent.extensions,
      currentLabel,
      otherLabel,
      this.logger
    );
    const configMergeResult = configMerger.merge();

    const mergeResults = await threeWayMerge({
      consumer: this.workspace.consumer,
      otherComponent,
      otherLabel,
      currentComponent,
      currentLabel,
      baseComponent,
    });
    return { currentComponent, id, mergeResults, divergeData, configMergeResult };
  }

  private returnUnmerged(id: BitId, msg: string, unmergedLegitimately = false): ComponentMergeStatusBeforeMergeAttempt {
    const componentStatus: ComponentMergeStatusBeforeMergeAttempt = { id };
    componentStatus.unmergedMessage = msg;
    componentStatus.unmergedLegitimately = unmergedLegitimately;
    return componentStatus;
  }

  private async getComponentStatusBeforeMergeAttempt(
    id: BitId // the id.version is the version we want to merge to the current component
  ): Promise<ComponentMergeStatusBeforeMergeAttempt> {
    const consumer = this.workspace.consumer;
    const componentStatus: ComponentMergeStatusBeforeMergeAttempt = { id };
    const modelComponent = await consumer.scope.getModelComponentIfExist(id);
    if (!modelComponent) {
      return this.returnUnmerged(
        id,
        `component ${id.toString()} is on the lane/main but its objects were not found, please re-import the lane`
      );
    }
    const unmerged = consumer.scope.objects.unmergedComponents.getEntry(id.name);
    if (unmerged) {
      return this.returnUnmerged(
        id,
        `component ${id.toStringWithoutVersion()} is in during-merge state a previous merge, please snap/tag it first (or use bit merge --resolve/--abort/ bit lane merge-abort)`
      );
    }
    const repo = consumer.scope.objects;
    const version = id.version as string;
    const otherLaneHead = modelComponent.getRef(version);
    const existingBitMapId = consumer.bitMap.getBitIdIfExist(id, { ignoreVersion: true });
    const componentOnOther: Version = await modelComponent.loadVersion(version, consumer.scope.objects);
    const idOnCurrentLane = this.currentLane?.getComponent(id);

    if (componentOnOther.isRemoved()) {
      // if exist in current lane, we want the current lane to get the soft-remove update.
      // or if it was removed with --update-main, we want to merge it so then main will get the update.
      const shouldMerge = idOnCurrentLane || componentOnOther.shouldRemoveFromMain();
      if (shouldMerge) {
        // remove the component from the workspace if exist.
        componentStatus.shouldBeRemoved = true;
      } else {
        // on main, don't merge soft-removed components unless it's marked with removeOnMain.
        // on lane, if it's not part of the current lane, don't merge it.
        return this.returnUnmerged(id, `component has been removed`, true);
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
    const getCurrentComponent = () => {
      if (existingBitMapId) return consumer.loadComponent(existingBitMapId);
      return consumer.scope.getConsumerComponent(currentId);
    };
    const currentComponent = await getCurrentComponent();
    if (currentComponent.isRemoved()) {
      // we have a few options:
      // 1. other is ahead. in this case, other recovered the component. so we can continue with the merge.
      // it is possible that it is diverged, in which case, still continue with the merge, and later on, the
      // merge-config will show a config conflict of the remove aspect.
      // 2. other is not ahead. in this case, just ignore this component, no point to merge it, we want it removed.
      // 3. there are errors when calculating the divergeData, e.g. no snap in common. in such cases, we assume
      // there are issues with this component, and is better not to merge it.
      const divergeData = await getDivergeData({ repo, modelComponent, targetHead: otherLaneHead, throws: false });
      if (divergeData.err || !divergeData.isTargetAhead()) {
        return this.returnUnmerged(id, `component has been removed`, true);
      }
    }

    const isModified = async (): Promise<undefined | 'code' | 'config'> => {
      const componentModificationStatus = await consumer.getComponentStatusById(currentComponent.id);
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
      targetHead: otherLaneHead,
      throws: false,
    });
    if (divergeData.err) {
      if (!(divergeData.err instanceof NoCommonSnap) || !this.options?.resolveUnrelated) {
        return this.returnUnmerged(
          id,
          `unable to traverse ${currentComponent.id.toString()} history. error: ${divergeData.err.message}`
        );
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
    if (!divergeData.isDiverged()) {
      if (divergeData.isSourceAhead()) {
        // do nothing!
        return this.returnUnmerged(id, `component ${currentComponent.id.toString()} is ahead, nothing to merge`, true);
      }
      if (divergeData.isTargetAhead()) {
        // just override with the model data
        return {
          ...componentStatus,
          currentComponent,
          componentFromModel: componentOnOther,
          divergeData,
        };
      }
      // we know that localHead and remoteHead are set, so if none of them is ahead they must be equal
      return this.returnUnmerged(id, `component ${currentComponent.id.toString()} is already merged`, true);
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
    id: BitId,
    otherLaneHead: Ref,
    currentComponent: ConsumerComponent,
    componentOnOther?: Version,
    divergeData?: SnapsDistance
  ): Promise<ComponentMergeStatusBeforeMergeAttempt> {
    const { resolveUnrelated } = this.options || {};
    if (!resolveUnrelated) throw new Error(`handleNoCommonSnap expects resolveUnrelated to be set`);
    const consumer = this.workspace.consumer;
    const repo = consumer.scope.objects;
    const mainHead = modelComponent.head;
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
          `unable to traverse ${currentComponent.id.toString()} history. the main-head ${mainHead.toString()} doesn't appear in both lanes, it was probably created in each lane separately`
        );
      }
      const versionToSaveInLane = hasResolvedLocally ? currentComponent.id.version : id.version;
      const resolvedRef = modelComponent.getRef(versionToSaveInLane as string);
      if (!resolvedRef) throw new Error(`unable to get ref of "${versionToSaveInLane}" for "${id.toString()}"`);
      const unrelatedHead = hasResolvedLocally ? id.version : currentComponent.id.version;
      const unrelatedHeadRef = modelComponent.getRef(unrelatedHead as string);
      if (!unrelatedHeadRef) throw new Error(`unable to get ref of "${unrelatedHead}" for "${id.toString()}"`);
      if (this.options?.resolveUnrelated === 'ours') {
        return {
          currentComponent,
          id,
          divergeData,
          resolvedUnrelated: {
            strategy: 'ours',
            headOnLane: resolvedRef,
            unrelatedHead: unrelatedHeadRef,
            unrelatedLaneId: this.currentLane?.toLaneId() as LaneId,
            futureParent: resolvedRef,
          },
        };
      }
      if (this.options?.resolveUnrelated === 'theirs') {
        // just override with the model data
        return {
          currentComponent,
          componentFromModel: componentOnOther,
          id,
          divergeData,
          resolvedUnrelated: {
            strategy: 'theirs',
            headOnLane: resolvedRef,
            unrelatedHead: unrelatedHeadRef,
            unrelatedLaneId: this.currentLane?.toLaneId() as LaneId,
            futureParent: resolvedRef,
          },
        };
      }
      throw new Error(
        `unsupported strategy "${this.options?.resolveUnrelated}" of resolve-unrelated. supported strategies are: [ours, theirs]`
      );
    }
    const versionToSaveInLane = resolveUnrelated === 'ours' ? currentComponent.id.version : id.version;
    const unrelatedHead = resolveUnrelated === 'ours' ? id.version : currentComponent.id.version;
    const resolvedRef = modelComponent.getRef(versionToSaveInLane as string);
    if (!resolvedRef) throw new Error(`unable to get ref of "${versionToSaveInLane}" for "${id.toString()}"`);
    const unrelatedHeadRef = modelComponent.getRef(unrelatedHead as string);
    if (!unrelatedHeadRef) throw new Error(`unable to get ref of "${unrelatedHead}" for "${id.toString()}"`);
    if (resolveUnrelated === 'ours') {
      return {
        currentComponent,
        id,
        divergeData,
        resolvedUnrelated: {
          headOnLane: resolvedRef,
          strategy: 'ours',
          unrelatedHead: unrelatedHeadRef,
          unrelatedLaneId: this.otherLane?.toLaneId() as LaneId,
          futureParent: resolvedRef,
        },
      };
    }
    if (resolveUnrelated === 'theirs') {
      // just override with the model data
      return {
        currentComponent,
        componentFromModel: componentOnOther,
        id,
        divergeData,
        resolvedUnrelated: {
          headOnLane: resolvedRef,
          strategy: 'theirs',
          unrelatedHead: unrelatedHeadRef,
          unrelatedLaneId: this.currentLane?.toLaneId() as LaneId,
          futureParent: resolvedRef,
        },
      };
    }
    throw new Error(
      `unsupported strategy "${this.options?.resolveUnrelated}" of resolve-unrelated. supported strategies are: [ours, theirs]`
    );
  }
}
