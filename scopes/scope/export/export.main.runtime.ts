import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import ScopeAspect, { ScopeMain } from '@teambit/scope';
import R from 'ramda';
import { BitError } from '@teambit/bit-error';
import { Analytics } from '@teambit/legacy/dist/analytics/analytics';
import { BitId, BitIds } from '@teambit/legacy/dist/bit-id';
import loader from '@teambit/legacy/dist/cli/loader';
import {
  BEFORE_EXPORT,
  BEFORE_EXPORTS,
  BEFORE_LOADING_COMPONENTS,
} from '@teambit/legacy/dist/cli/loader/loader-messages';
import { POST_EXPORT_HOOK, PRE_EXPORT_HOOK } from '@teambit/legacy/dist/constants';
import { Consumer, loadConsumer } from '@teambit/legacy/dist/consumer';
import BitMap from '@teambit/legacy/dist/consumer/bit-map/bit-map';
import EjectComponents, { EjectResults } from '@teambit/legacy/dist/consumer/component-ops/eject-components';
import ComponentsList from '@teambit/legacy/dist/consumer/component/components-list';
import GeneralError from '@teambit/legacy/dist/error/general-error';
import HooksManager from '@teambit/legacy/dist/hooks';
import { RemoveAspect, RemoveMain } from '@teambit/remove';
import { NodeModuleLinker } from '@teambit/legacy/dist/links';
import logger from '@teambit/legacy/dist/logger/logger';
import { exportMany } from '@teambit/legacy/dist/scope/component-ops/export-scope-components';
import { Lane } from '@teambit/legacy/dist/scope/models';
import hasWildcard from '@teambit/legacy/dist/utils/string/has-wildcard';
import { Scope } from '@teambit/legacy/dist/scope';
import WorkspaceAspect, { Workspace } from '@teambit/workspace';
import { ConsumerNotFound } from '@teambit/legacy/dist/consumer/exceptions';
import { LaneReadmeComponent } from '@teambit/legacy/dist/scope/models/lane';
import { ExportAspect } from './export.aspect';
import { ExportCmd } from './export-cmd';
import { ResumeExportCmd } from './resume-export-cmd';

const HooksManagerInstance = HooksManager.getInstance();

type ExportParams = {
  ids: string[];
  eject: boolean;
  allVersions: boolean;
  originDirectly: boolean;
  includeNonStaged: boolean;
  resumeExportId: string | undefined;
  ignoreMissingArtifacts: boolean;
};

export class ExportMain {
  constructor(private workspace: Workspace, private remove: RemoveMain) {}

  async export(params: ExportParams) {
    HooksManagerInstance.triggerHook(PRE_EXPORT_HOOK, params);
    const { updatedIds, nonExistOnBitMap, missingScope, exported, removedIds, exportedLanes } =
      await this.exportComponents(params);
    let ejectResults;
    if (params.eject) ejectResults = await ejectExportedComponents(updatedIds);
    const exportResults = {
      componentsIds: exported,
      nonExistOnBitMap,
      removedIds,
      missingScope,
      ejectResults,
      exportedLanes,
    };
    HooksManagerInstance.triggerHook(POST_EXPORT_HOOK, exportResults);
    if (Scope.onPostExport) {
      await Scope.onPostExport(exported, exportedLanes).catch((err) => {
        logger.error('fatal: onPostExport encountered an error (this error does not stop the process)', err);
      });
    }
    return exportResults;
  }

  private async exportComponents({ ids, includeNonStaged, originDirectly, ...params }: ExportParams): Promise<{
    updatedIds: BitId[];
    nonExistOnBitMap: BitId[];
    removedIds: BitIds;
    missingScope: BitId[];
    exported: BitId[];
    exportedLanes: Lane[];
    newIdsOnRemote: BitId[];
  }> {
    if (!this.workspace) throw new ConsumerNotFound();
    const consumer: Consumer = this.workspace.consumer;
    const { idsToExport, missingScope, idsWithFutureScope, laneObject } = await this.getComponentsToExport(
      ids,
      includeNonStaged
    );

    if (R.isEmpty(idsToExport)) {
      return {
        updatedIds: [],
        nonExistOnBitMap: [],
        removedIds: new BitIds(),
        missingScope,
        exported: [],
        newIdsOnRemote: [],
        exportedLanes: [],
      };
    }

    // validate lane readme component and ensure it has been snapped
    if (laneObject?.readmeComponent) {
      _throwForUnsnappedLaneReadme(laneObject);
    }
    const isOnMain = consumer.isOnMain();
    const { exported, updatedLocally, newIdsOnRemote } = await exportMany({
      ...params,
      scope: consumer.scope,
      ids: idsToExport,
      laneObject,
      originDirectly,
      idsWithFutureScope,
      isOnMain,
    });
    if (laneObject) await updateLanesAfterExport(consumer, laneObject);
    const removedIds = await this.getRemovedStagedBitIds();
    const { updatedIds, nonExistOnBitMap } = _updateIdsOnBitMap(consumer.bitMap, updatedLocally);
    await this.removeFromStagedConfig([...updatedIds, ...nonExistOnBitMap]);
    await linkComponents(updatedIds, consumer);
    Analytics.setExtraData('num_components', exported.length);
    // it is important to have consumer.onDestroy() before running the eject operation, we want the
    // export and eject operations to function independently. we don't want to lose the changes to
    // .bitmap file done by the export action in case the eject action has failed.
    await consumer.onDestroy();
    return {
      updatedIds,
      nonExistOnBitMap: nonExistOnBitMap.filter((id) => !removedIds.hasWithoutVersion(id)),
      removedIds,
      missingScope,
      exported,
      newIdsOnRemote,
      exportedLanes: laneObject ? [laneObject] : [],
    };
  }

  private async removeFromStagedConfig(ids: BitId[]) {
    const componentIds = await this.workspace.resolveMultipleComponentIds(ids);
    const stagedConfig = await this.workspace.scope.getStagedConfig();
    componentIds.map((compId) => stagedConfig.removeComponentConfig(compId));
    await stagedConfig.write();
  }

  private async getComponentsToExport(
    ids: string[],
    includeNonStaged: boolean
  ): Promise<{ idsToExport: BitIds; missingScope: BitId[]; idsWithFutureScope: BitIds; laneObject?: Lane }> {
    const consumer = this.workspace.consumer;
    const componentsList = new ComponentsList(consumer);
    const idsHaveWildcard = hasWildcard(ids);
    const filterNonScopeIfNeeded = async (
      bitIds: BitIds
    ): Promise<{ idsToExport: BitIds; missingScope: BitId[]; idsWithFutureScope: BitIds }> => {
      const idsWithFutureScope = await this.getIdsWithFutureScope(bitIds);
      const [idsToExport, missingScope] = R.partition((id) => {
        const idWithFutureScope = idsWithFutureScope.searchWithoutScopeAndVersion(id);
        if (!idWithFutureScope) throw new Error(`idsWithFutureScope is missing ${id.toString()}`);
        return idWithFutureScope.hasScope();
      }, bitIds);
      return { idsToExport: BitIds.fromArray(idsToExport), missingScope, idsWithFutureScope };
    };
    if (isUserTryingToExportLanes(consumer)) {
      if (ids.length) {
        throw new GeneralError(`when checked out to a lane, all its components are exported. please omit the ids`);
      }
      const { componentsToExport, laneObject } = await this.getLaneCompIdsToExport(consumer, includeNonStaged);
      const loaderMsg = componentsToExport.length > 1 ? BEFORE_EXPORTS : BEFORE_EXPORT;
      loader.start(loaderMsg);
      const filtered = await filterNonScopeIfNeeded(componentsToExport);
      return { ...filtered, laneObject };
    }
    if (!ids.length || idsHaveWildcard) {
      loader.start(BEFORE_LOADING_COMPONENTS);
      const exportPendingComponents: BitIds = includeNonStaged
        ? await componentsList.listNonNewComponentsIds()
        : await componentsList.listExportPendingComponentsIds();
      const componentsToExport = idsHaveWildcard
        ? ComponentsList.filterComponentsByWildcard(exportPendingComponents, ids)
        : exportPendingComponents;
      const loaderMsg = componentsToExport.length > 1 ? BEFORE_EXPORTS : BEFORE_EXPORT;
      loader.start(loaderMsg);
      return filterNonScopeIfNeeded(componentsToExport);
    }
    loader.start(BEFORE_EXPORT); // show single export
    const parsedIds = await Promise.all(ids.map((id) => getParsedId(consumer, id)));
    const statuses = await consumer.getManyComponentsStatuses(parsedIds);
    statuses.forEach(({ id, status }) => {
      if (status.nested) {
        throw new GeneralError(
          `unable to export "${id.toString()}", the component is not fully available. please use "bit import" first`
        );
      }
    });
    return filterNonScopeIfNeeded(BitIds.fromArray(parsedIds));
  }

  private async getIdsWithFutureScope(ids: BitIds): Promise<BitIds> {
    const idsArrayP = ids.map(async (id) => {
      if (id.hasScope()) return id;
      const componentId = await this.workspace.resolveComponentId(id);
      const finalScope = await this.workspace.componentDefaultScope(componentId);
      if (finalScope) {
        return id.changeScope(finalScope);
      }
      return id;
    });
    const idsArray = await Promise.all(idsArrayP);
    return BitIds.fromArray(idsArray);
  }

  private async getLaneCompIdsToExport(
    consumer: Consumer,
    includeNonStaged: boolean
  ): Promise<{ componentsToExport: BitIds; laneObject: Lane }> {
    const currentLaneId = consumer.getCurrentLaneId();
    const laneObject = await consumer.scope.loadLane(currentLaneId);
    if (!laneObject) {
      throw new Error(`fatal: unable to load the current lane object (${currentLaneId.toString()})`);
    }
    loader.start(BEFORE_LOADING_COMPONENTS);
    const componentsList = new ComponentsList(consumer);
    const componentsToExportWithoutRemoved = includeNonStaged
      ? await componentsList.listNonNewComponentsIds()
      : await componentsList.listExportPendingComponentsIds(laneObject);
    const removedStagedBitIds = await this.getRemovedStagedBitIds();
    const componentsToExport = BitIds.uniqFromArray([...componentsToExportWithoutRemoved, ...removedStagedBitIds]);
    return { componentsToExport, laneObject };
  }

  private async getRemovedStagedBitIds(): Promise<BitIds> {
    const removedStaged = await this.remove.getRemovedStaged();
    return BitIds.fromArray(removedStaged.map((r) => r._legacy).map((id) => id.changeVersion(undefined)));
  }

  static runtime = MainRuntime;
  static dependencies = [CLIAspect, ScopeAspect, WorkspaceAspect, RemoveAspect];
  static async provider([cli, scope, workspace, remove]: [CLIMain, ScopeMain, Workspace, RemoveMain]) {
    const exportMain = new ExportMain(workspace, remove);
    cli.register(new ResumeExportCmd(scope), new ExportCmd(exportMain));
    return exportMain;
  }
}

ExportAspect.addRuntime(ExportMain);

function _updateIdsOnBitMap(bitMap: BitMap, componentsIds: BitIds): { updatedIds: BitId[]; nonExistOnBitMap: BitIds } {
  const updatedIds = [];
  const nonExistOnBitMap = new BitIds();
  componentsIds.forEach((componentsId) => {
    const resultId = bitMap.updateComponentId(componentsId, true);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    if (resultId.hasVersion()) updatedIds.push(resultId);
    else nonExistOnBitMap.push(resultId);
  });
  return { updatedIds, nonExistOnBitMap };
}

async function getParsedId(consumer: Consumer, id: string): Promise<BitId> {
  // reason why not calling `consumer.getParsedId()` first is because a component might not be on
  // .bitmap and only in the scope. we support this case and enable to export
  const parsedId: BitId = await consumer.scope.getParsedId(id);
  if (parsedId.hasScope()) return parsedId;
  // parsing id from the scope, doesn't provide the scope-name in case it's missing, in this case
  // get the id including the scope from the consumer.
  try {
    return consumer.getParsedId(id);
  } catch (err: any) {
    // not in the consumer, just return the one parsed without the scope name
    return parsedId;
  }
}

async function linkComponents(ids: BitId[], consumer: Consumer): Promise<void> {
  // we don't have much of a choice here, we have to load all the exported components in order to link them
  // some of the components might be authored, some might be imported.
  // when a component has dists, we need the consumer-component object to retrieve the dists info.
  const components = await Promise.all(ids.map((id) => consumer.loadComponentFromModel(id)));
  const nodeModuleLinker = new NodeModuleLinker(components, consumer, consumer.bitMap);
  await nodeModuleLinker.link();
}

async function ejectExportedComponents(componentsIds): Promise<EjectResults> {
  const consumer: Consumer = await loadConsumer(undefined, true);
  let ejectResults: EjectResults;
  try {
    const ejectComponents = new EjectComponents(consumer, componentsIds);
    ejectResults = await ejectComponents.eject();
  } catch (err: any) {
    const ejectErr = `The components ${componentsIds.map((c) => c.toString()).join(', ')} were exported successfully.
    However, the eject operation has failed due to an error: ${err.msg || err}`;
    logger.error(ejectErr, err);
    throw new Error(ejectErr);
  }
  // run the consumer.onDestroy() again, to write the changes done by the eject action to .bitmap
  await consumer.onDestroy();
  return ejectResults;
}

function _throwForUnsnappedLaneReadme(lane: Lane) {
  const readmeComponent = lane.readmeComponent as LaneReadmeComponent;

  const isValid =
    readmeComponent?.head &&
    lane.getComponent(readmeComponent.id) &&
    lane.getComponentHead(readmeComponent.id)?.isEqual(readmeComponent?.head);

  if (!isValid) {
    throw new BitError(
      `${lane?.name} has a readme component ${readmeComponent.id} that hasn't been snapped on the lane.
      Please run either snap -a or snap ${readmeComponent.id} to snap the component on the lane before exporting it.`
    );
  }
}

async function updateLanesAfterExport(consumer: Consumer, lane: Lane) {
  const currentLane = consumer.getCurrentLaneId();
  const isCurrentLane = lane.name === currentLane.name;
  if (!isCurrentLane) {
    throw new Error(
      `updateLanesAfterExport should get called only with current lane, got ${lane.name}, current ${currentLane.name}`
    );
  }
  consumer.setCurrentLane(lane.toLaneId(), true);
  consumer.scope.scopeJson.removeLaneFromNew(lane.name);
  lane.isNew = false;
}

export function isUserTryingToExportLanes(consumer: Consumer) {
  return consumer.isOnLane();
}
