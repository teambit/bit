import R from 'ramda';
import { BitError } from '@teambit/bit-error';
import { Analytics } from '../../../analytics/analytics';
import { BitId, BitIds } from '../../../bit-id';
import loader from '../../../cli/loader';
import { BEFORE_EXPORT, BEFORE_EXPORTS, BEFORE_LOADING_COMPONENTS } from '../../../cli/loader/loader-messages';
import { DEFAULT_BINDINGS_PREFIX, POST_EXPORT_HOOK, PRE_EXPORT_HOOK } from '../../../constants';
import { Consumer, loadConsumer } from '../../../consumer';
import BitMap from '../../../consumer/bit-map/bit-map';
import EjectComponents, { EjectResults } from '../../../consumer/component-ops/eject-components';
import ComponentsList from '../../../consumer/component/components-list';
import {
  getLaneCompIdsToExport,
  isUserTryingToExportLanes,
  updateLanesAfterExport,
} from '../../../consumer/lanes/export-lanes';
import GeneralError from '../../../error/general-error';
import HooksManager from '../../../hooks';
import { NodeModuleLinker } from '../../../links';
import logger from '../../../logger/logger';
import { exportMany } from '../../../scope/component-ops/export-scope-components';
import { Lane } from '../../../scope/models';
import hasWildcard from '../../../utils/string/has-wildcard';
import { Scope } from '../../../scope';
import { LaneReadmeComponent } from '../../../scope/models/lane';

const HooksManagerInstance = HooksManager.getInstance();

type DefaultScopeGetter = (id: BitId) => Promise<string | undefined>;

let getDefaultScope: DefaultScopeGetter;
export function registerDefaultScopeGetter(func: DefaultScopeGetter) {
  getDefaultScope = func;
}

type ExportParams = {
  ids: string[];
  eject: boolean;
  allVersions: boolean;
  originDirectly: boolean;
  includeNonStaged: boolean;
  resumeExportId: string | undefined;
  ignoreMissingArtifacts: boolean;
};

export default async function exportAction(params: ExportParams) {
  HooksManagerInstance.triggerHook(PRE_EXPORT_HOOK, params);
  const { updatedIds, nonExistOnBitMap, missingScope, exported, exportedLanes } = await exportComponents(params);
  let ejectResults;
  if (params.eject) ejectResults = await ejectExportedComponents(updatedIds);
  const exportResults = {
    componentsIds: exported,
    nonExistOnBitMap,
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

async function exportComponents({ ids, includeNonStaged, originDirectly, ...params }: ExportParams): Promise<{
  updatedIds: BitId[];
  nonExistOnBitMap: BitId[];
  missingScope: BitId[];
  exported: BitId[];
  exportedLanes: Lane[];
  newIdsOnRemote: BitId[];
}> {
  const consumer: Consumer = await loadConsumer();
  const { idsToExport, missingScope, idsWithFutureScope, laneObject } = await getComponentsToExport(
    ids,
    consumer,
    includeNonStaged
  );

  if (R.isEmpty(idsToExport)) {
    return { updatedIds: [], nonExistOnBitMap: [], missingScope, exported: [], newIdsOnRemote: [], exportedLanes: [] };
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
  const { updatedIds, nonExistOnBitMap } = _updateIdsOnBitMap(consumer.bitMap, updatedLocally);
  await linkComponents(updatedIds, consumer);
  Analytics.setExtraData('num_components', exported.length);
  // it is important to have consumer.onDestroy() before running the eject operation, we want the
  // export and eject operations to function independently. we don't want to lose the changes to
  // .bitmap file done by the export action in case the eject action has failed.
  await consumer.onDestroy();
  return {
    updatedIds,
    nonExistOnBitMap,
    missingScope,
    exported,
    newIdsOnRemote,
    exportedLanes: laneObject ? [laneObject] : [],
  };
}

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

async function getComponentsToExport(
  ids: string[],
  consumer: Consumer,
  includeNonStaged: boolean
): Promise<{ idsToExport: BitIds; missingScope: BitId[]; idsWithFutureScope: BitIds; laneObject?: Lane }> {
  const componentsList = new ComponentsList(consumer);
  const idsHaveWildcard = hasWildcard(ids);
  const filterNonScopeIfNeeded = async (
    bitIds: BitIds
  ): Promise<{ idsToExport: BitIds; missingScope: BitId[]; idsWithFutureScope: BitIds }> => {
    const idsWithFutureScope = await getIdsWithFutureScope(bitIds, consumer);
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
    const { componentsToExport, laneObject } = await getLaneCompIdsToExport(consumer, includeNonStaged);
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

async function getIdsWithFutureScope(ids: BitIds, consumer: Consumer): Promise<BitIds> {
  const workspaceDefaultScope = consumer.config.defaultScope;
  let workspaceDefaultOwner = consumer.config.defaultOwner;
  // For backward computability don't treat the default binding prefix as real owner
  if (workspaceDefaultOwner === DEFAULT_BINDINGS_PREFIX) {
    workspaceDefaultOwner = undefined;
  }

  const idsArrayP = ids.map(async (id) => {
    if (id.hasScope()) return id;
    let finalScope = workspaceDefaultScope;
    if (getDefaultScope && typeof getDefaultScope === 'function') {
      finalScope = await getDefaultScope(id);
      if (finalScope) {
        return id.changeScope(finalScope);
      }
    }
    return id;
  });
  const idsArray = await Promise.all(idsArrayP);
  return BitIds.fromArray(idsArray);
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
