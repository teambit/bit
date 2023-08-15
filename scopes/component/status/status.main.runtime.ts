import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import pMapSeries from 'p-map-series';
import { LaneId } from '@teambit/lane-id';
import { IssuesList } from '@teambit/component-issues';
import WorkspaceAspect, { OutsideWorkspaceError, Workspace } from '@teambit/workspace';
import LanesAspect, { LanesMain } from '@teambit/lanes';
import { ComponentID } from '@teambit/component-id';
import { Component } from '@teambit/component';
import { Analytics } from '@teambit/legacy/dist/analytics/analytics';
import loader from '@teambit/legacy/dist/cli/loader';
import { BEFORE_STATUS } from '@teambit/legacy/dist/cli/loader/loader-messages';
import { RemoveAspect, RemoveMain } from '@teambit/remove';
import ConsumerComponent from '@teambit/legacy/dist/consumer/component';
import ComponentsPendingImport from '@teambit/legacy/dist/consumer/component-ops/exceptions/components-pending-import';
import { BitId } from '@teambit/legacy-bit-id';
import ComponentsList from '@teambit/legacy/dist/consumer/component/components-list';
import { ModelComponent } from '@teambit/legacy/dist/scope/models';
import { InsightsAspect, InsightsMain } from '@teambit/insights';
import { SnapsDistance } from '@teambit/legacy/dist/scope/component-ops/snaps-distance';
import IssuesAspect, { IssuesMain } from '@teambit/issues';
import { StatusCmd } from './status-cmd';
import { StatusAspect } from './status.aspect';
import MiniStatusCmd, { MiniStatusOpts } from './mini-status-cmd';

type DivergeDataPerId = { id: ComponentID; divergeData: SnapsDistance };

export type StatusResult = {
  newComponents: ComponentID[];
  modifiedComponents: ComponentID[];
  stagedComponents: { id: ComponentID; versions: string[] }[];
  componentsWithIssues: { id: ComponentID; issues: IssuesList }[];
  importPendingComponents: ComponentID[];
  autoTagPendingComponents: ComponentID[];
  invalidComponents: { id: ComponentID; error: Error }[];
  locallySoftRemoved: ComponentID[];
  remotelySoftRemoved: ComponentID[];
  outdatedComponents: { id: ComponentID; headVersion: string; latestVersion?: string }[];
  mergePendingComponents: DivergeDataPerId[];
  componentsDuringMergeState: ComponentID[];
  softTaggedComponents: ComponentID[];
  snappedComponents: ComponentID[];
  pendingUpdatesFromMain: DivergeDataPerId[];
  updatesFromForked: DivergeDataPerId[];
  unavailableOnMain: ComponentID[];
  currentLaneId: LaneId;
  forkedLaneId?: LaneId;
  workspaceIssues: string[];
};

export type MiniStatusResults = {
  modified: ComponentID[];
  newComps: ComponentID[];
  compWithIssues?: Component[];
};

export class StatusMain {
  constructor(
    private workspace: Workspace,
    private issues: IssuesMain,
    private insights: InsightsMain,
    private remove: RemoveMain,
    private lanes: LanesMain
  ) {}

  async status({ lanes }: { lanes?: boolean }): Promise<StatusResult> {
    if (!this.workspace) throw new OutsideWorkspaceError();
    loader.start(BEFORE_STATUS);
    const loadOpts = {
      loadDocs: false,
      loadCompositions: false,
    };
    const { components: allComps, invalidComponents: allInvalidComponents } = await this.workspace.listWithInvalid(
      loadOpts
    );
    const consumer = this.workspace.consumer;
    const laneObj = await consumer.getCurrentLaneObject();
    const componentsList = new ComponentsList(consumer);
    const newComponents: ConsumerComponent[] = (await componentsList.listNewComponents(
      true,
      loadOpts
    )) as ConsumerComponent[];
    const modifiedComponents = (await componentsList.listModifiedComponents(true, loadOpts)) as ConsumerComponent[];
    const stagedComponents: ModelComponent[] = await componentsList.listExportPendingComponents(laneObj);
    await this.addRemovedStagedIfNeeded(stagedComponents);
    const stagedComponentsWithVersions = await pMapSeries(stagedComponents, async (stagedComp) => {
      const versions = await stagedComp.getLocalTagsOrHashes(consumer.scope.objects);
      return {
        id: stagedComp.toBitId(),
        versions,
      };
    });

    const unavailableOnMain = await this.workspace.getUnavailableOnMainComponents();
    const autoTagPendingComponents = await componentsList.listAutoTagPendingComponents();
    const autoTagPendingComponentsIds = autoTagPendingComponents.map((component) => component.id);
    const locallySoftRemoved = await componentsList.listLocallySoftRemoved();
    const remotelySoftRemoved = await componentsList.listRemotelySoftRemoved();
    const importPendingComponents = allInvalidComponents
      .filter((c) => c.err instanceof ComponentsPendingImport)
      .map((i) => i.id);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const invalidComponents = allInvalidComponents.filter((c) => !(c.error instanceof ComponentsPendingImport));
    const outdatedComponents = await componentsList.listOutdatedComponents();
    const idsDuringMergeState = componentsList.listDuringMergeStateComponents();
    const mergePendingComponents = await componentsList.listMergePendingComponents();
    if (allComps.length) {
      const issuesToIgnore = this.issues.getIssuesToIgnoreGlobally();
      await this.issues.triggerAddComponentIssues(allComps, issuesToIgnore);
      this.issues.removeIgnoredIssuesFromComponents(allComps);
    }
    const componentsWithIssues = allComps.filter((component) => !component.state.issues.isEmpty());
    const softTaggedComponents = componentsList.listSoftTaggedComponents();
    const snappedComponents = (await componentsList.listSnappedComponentsOnMain()).map((c) => c.toBitId());
    const pendingUpdatesFromMain = lanes ? await componentsList.listUpdatesFromMainPending() : [];
    const updatesFromForked = lanes ? await this.lanes.listUpdatesFromForked(componentsList) : [];
    const currentLaneId = consumer.getCurrentLaneId();
    const currentLane = await consumer.getCurrentLaneObject();
    const forkedLaneId = currentLane?.forkedFrom;
    const workspaceIssues = this.workspace.getWorkspaceIssues();
    Analytics.setExtraData('new_components', newComponents.length);
    Analytics.setExtraData('staged_components', stagedComponents.length);
    Analytics.setExtraData('num_components_with_missing_dependencies', componentsWithIssues.length);
    Analytics.setExtraData('autoTagPendingComponents', autoTagPendingComponents.length);
    Analytics.setExtraData('deleted', invalidComponents.length);

    const convertBitIdToComponentIdsAndSort = async (ids: BitId[]) =>
      ComponentID.sortIds(await this.workspace.resolveMultipleComponentIds(ids));

    const convertObjToComponentIdsAndSort = async <T>(
      objectsWithId: Array<T & { id: BitId }>
    ): Promise<Array<T & { id: ComponentID }>> => {
      const results = await Promise.all(
        objectsWithId.map(async (obj) => {
          return {
            ...obj,
            id: await this.workspace.resolveComponentId(obj.id),
          };
        })
      );
      return results.sort((a, b) => a.id.toString().localeCompare(b.id.toString()));
    };

    const sortObjectsWithId = <T>(objectsWithId: Array<T & { id: ComponentID }>): Array<T & { id: ComponentID }> => {
      return objectsWithId.sort((a, b) => a.id.toString().localeCompare(b.id.toString()));
    };

    await consumer.onDestroy();
    return {
      newComponents: await convertBitIdToComponentIdsAndSort(newComponents.map((c) => c.id)),
      modifiedComponents: await convertBitIdToComponentIdsAndSort(modifiedComponents.map((c) => c.id)),
      stagedComponents: await convertObjToComponentIdsAndSort(stagedComponentsWithVersions),
      componentsWithIssues: sortObjectsWithId(componentsWithIssues.map((c) => ({ id: c.id, issues: c.state.issues }))),
      importPendingComponents, // no need to sort, we use only its length
      autoTagPendingComponents: await convertBitIdToComponentIdsAndSort(autoTagPendingComponentsIds),
      invalidComponents: sortObjectsWithId(invalidComponents.map((c) => ({ id: c.id, error: c.err }))),
      locallySoftRemoved: await convertBitIdToComponentIdsAndSort(locallySoftRemoved),
      remotelySoftRemoved: await convertBitIdToComponentIdsAndSort(remotelySoftRemoved.map((c) => c.id)),
      outdatedComponents: await convertObjToComponentIdsAndSort(
        outdatedComponents.map((c) => ({
          id: c.id,
          headVersion: c.headVersion,
          latestVersion: c.latestVersion,
        }))
      ),
      mergePendingComponents: await convertObjToComponentIdsAndSort(
        mergePendingComponents.map((c) => ({ id: c.id, divergeData: c.diverge }))
      ),
      componentsDuringMergeState: await convertBitIdToComponentIdsAndSort(idsDuringMergeState),
      softTaggedComponents: await convertBitIdToComponentIdsAndSort(softTaggedComponents),
      snappedComponents: await convertBitIdToComponentIdsAndSort(snappedComponents),
      pendingUpdatesFromMain: await convertObjToComponentIdsAndSort(pendingUpdatesFromMain),
      updatesFromForked: await convertObjToComponentIdsAndSort(updatesFromForked),
      unavailableOnMain,
      currentLaneId,
      forkedLaneId,
      workspaceIssues: workspaceIssues.map((err) => err.message),
    };
  }

  async statusMini(componentPattern?: string, opts: MiniStatusOpts = {}): Promise<MiniStatusResults> {
    const ids = componentPattern ? await this.workspace.idsByPattern(componentPattern) : await this.workspace.listIds();
    const compFiles = await pMapSeries(ids, (id) => this.workspace.getFilesModification(id));
    const modified: ComponentID[] = [];
    const newComps: ComponentID[] = [];
    compFiles.forEach((comp) => {
      if (!comp.id.hasVersion()) newComps.push(comp.id);
      if (comp.isModified()) modified.push(comp.id);
    });
    const loadOpts = {
      loadDocs: false,
      loadCompositions: false,
    };
    const comps = opts.showIssues ? await this.workspace.getMany(ids, loadOpts) : [];
    if (opts.showIssues) {
      const issuesToIgnore = this.issues.getIssuesToIgnoreGlobally();
      await this.issues.triggerAddComponentIssues(comps, issuesToIgnore);
      this.issues.removeIgnoredIssuesFromComponents(comps);
    }
    const compWithIssues = comps.filter((c) => !c.state.issues.isEmpty());

    return { modified, newComps, compWithIssues };
  }

  private async addRemovedStagedIfNeeded(stagedComponents: ModelComponent[]) {
    const removedStagedIds = await this.remove.getRemovedStaged();
    if (!removedStagedIds.length) return;
    const removedStagedBitIds = removedStagedIds.map((id) => id._legacy);
    const nonExistsInStaged = removedStagedBitIds.filter(
      (id) => !stagedComponents.find((c) => c.toBitId().isEqualWithoutVersion(id))
    );
    if (!nonExistsInStaged.length) return;
    const modelComps = await Promise.all(
      nonExistsInStaged.map((id) => this.workspace.scope.legacyScope.getModelComponent(id))
    );
    stagedComponents.push(...modelComps);
  }

  static slots = [];
  static dependencies = [CLIAspect, WorkspaceAspect, InsightsAspect, IssuesAspect, RemoveAspect, LanesAspect];
  static runtime = MainRuntime;
  static async provider([cli, workspace, insights, issues, remove, lanes]: [
    CLIMain,
    Workspace,
    InsightsMain,
    IssuesMain,
    RemoveMain,
    LanesMain
  ]) {
    const statusMain = new StatusMain(workspace, issues, insights, remove, lanes);
    cli.register(new StatusCmd(statusMain), new MiniStatusCmd(statusMain));
    return statusMain;
  }
}

StatusAspect.addRuntime(StatusMain);
