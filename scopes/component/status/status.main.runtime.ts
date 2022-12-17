import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import pMapSeries from 'p-map-series';
import { LaneId } from '@teambit/lane-id';
import { IssuesList } from '@teambit/component-issues';
import WorkspaceAspect, { OutsideWorkspaceError, Workspace } from '@teambit/workspace';
import { ComponentID } from '@teambit/component-id';
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
  currentLaneId: LaneId;
  forkedLaneId?: LaneId;
};

export class StatusMain {
  constructor(
    private workspace: Workspace,
    private issues: IssuesMain,
    private insights: InsightsMain,
    private remove: RemoveMain
  ) {}

  async status(): Promise<StatusResult> {
    if (!this.workspace) throw new OutsideWorkspaceError();
    loader.start(BEFORE_STATUS);
    const consumer = this.workspace.consumer;
    const laneObj = await consumer.getCurrentLaneObject();
    const componentsList = new ComponentsList(consumer);
    const loadOpts = {
      loadDocs: false,
      loadCompositions: false,
    };
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

    const autoTagPendingComponents = await componentsList.listAutoTagPendingComponents();
    const autoTagPendingComponentsIds = autoTagPendingComponents.map((component) => component.id);
    const allInvalidComponents = await componentsList.listInvalidComponents();
    const locallySoftRemoved = await componentsList.listLocallySoftRemoved();
    const remotelySoftRemoved = await componentsList.listRemotelySoftRemoved();
    const importPendingComponents = allInvalidComponents
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      .filter((c) => c.error instanceof ComponentsPendingImport)
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      .map((i) => i.id);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const invalidComponents = allInvalidComponents.filter((c) => !(c.error instanceof ComponentsPendingImport));
    const outdatedComponents = await componentsList.listOutdatedComponents();
    const idsDuringMergeState = componentsList.listDuringMergeStateComponents();
    const { components: componentsDuringMergeState } = await this.workspace.consumer.loadComponents(
      idsDuringMergeState,
      false
    );
    const mergePendingComponents = await componentsList.listMergePendingComponents();
    const legacyCompsWithPotentialIssues: ConsumerComponent[] = [
      ...newComponents,
      ...modifiedComponents,
      ...componentsDuringMergeState,
    ];
    const issuesToIgnore = this.issues.getIssuesToIgnoreGlobally();
    if (legacyCompsWithPotentialIssues.length) {
      const compsWithPotentialIssues = await this.workspace.getManyByLegacy(legacyCompsWithPotentialIssues, loadOpts);
      await this.issues.triggerAddComponentIssues(compsWithPotentialIssues, issuesToIgnore);
      this.issues.removeIgnoredIssuesFromComponents(compsWithPotentialIssues);
    }
    const componentsWithIssues = legacyCompsWithPotentialIssues.filter((component: ConsumerComponent) => {
      return component.issues && !component.issues.isEmpty();
    });

    const softTaggedComponents = componentsList.listSoftTaggedComponents();
    const snappedComponents = (await componentsList.listSnappedComponentsOnMain()).map((c) => c.toBitId());
    const pendingUpdatesFromMain = await componentsList.listUpdatesFromMainPending();
    const updatesFromForked = await componentsList.listUpdatesFromForked();
    const currentLaneId = consumer.getCurrentLaneId();
    const currentLane = await consumer.getCurrentLaneObject();
    const forkedLaneId = currentLane?.forkedFrom;
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

    await consumer.onDestroy();
    return {
      newComponents: await convertBitIdToComponentIdsAndSort(newComponents.map((c) => c.id)),
      modifiedComponents: await convertBitIdToComponentIdsAndSort(modifiedComponents.map((c) => c.id)),
      stagedComponents: await convertObjToComponentIdsAndSort(stagedComponentsWithVersions),
      // @ts-ignore - not clear why, it fails the "bit build" without it
      componentsWithIssues: await convertObjToComponentIdsAndSort(
        componentsWithIssues.map((c) => ({ id: c.id, issues: c.issues }))
      ), // no need to sort, we don't print it as is
      importPendingComponents: await convertBitIdToComponentIdsAndSort(importPendingComponents), // no need to sort, we use only its length
      autoTagPendingComponents: await convertBitIdToComponentIdsAndSort(autoTagPendingComponentsIds),
      invalidComponents: await convertObjToComponentIdsAndSort(
        invalidComponents.map((c) => ({ id: c.id, error: c.error }))
      ),
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
      currentLaneId,
      forkedLaneId,
    };
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
  static dependencies = [CLIAspect, WorkspaceAspect, InsightsAspect, IssuesAspect, RemoveAspect];
  static runtime = MainRuntime;
  static async provider([cli, workspace, insights, issues, remove]: [
    CLIMain,
    Workspace,
    InsightsMain,
    IssuesMain,
    RemoveMain
  ]) {
    const statusMain = new StatusMain(workspace, issues, insights, remove);
    cli.register(new StatusCmd(statusMain));
    return statusMain;
  }
}

StatusAspect.addRuntime(StatusMain);
