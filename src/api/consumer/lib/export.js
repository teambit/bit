/** @flow */
import R from 'ramda';
import { Consumer, loadConsumer } from '../../../consumer';
import ComponentsList from '../../../consumer/component/components-list';
import loader from '../../../cli/loader';
import { BEFORE_EXPORT, BEFORE_EXPORTS, BEFORE_LOADING_COMPONENTS } from '../../../cli/loader/loader-messages';
import { BitId, BitIds } from '../../../bit-id';
import IdExportedAlready from './exceptions/id-exported-already';
import logger from '../../../logger/logger';
import { Analytics } from '../../../analytics/analytics';
import EjectComponents from '../../../consumer/component-ops/eject-components';
import type { EjectResults } from '../../../consumer/component-ops/eject-components';
import hasWildcard from '../../../utils/string/has-wildcard';
import { exportMany } from '../../../scope/component-ops/export-scope-components';
import { NodeModuleLinker } from '../../../links';
import BitMap from '../../../consumer/bit-map/bit-map';

export default (async function exportAction(ids?: string[], remote: string, eject: ?boolean) {
  const { updatedIds: componentsIds, nonExistOnBitMap } = await exportComponents(ids, remote);
  let ejectResults;
  if (eject) ejectResults = await ejectExportedComponents(componentsIds);
  return { componentsIds, nonExistOnBitMap, ejectResults };
});

async function exportComponents(
  ids?: string[],
  remote: string
): Promise<{ updatedIds: BitId[], nonExistOnBitMap: BitId[] }> {
  const consumer: Consumer = await loadConsumer();
  const idsToExport = await getComponentsToExport(ids, consumer, remote);
  // todo: what happens when some failed? we might consider avoid Promise.all
  // in case we don't have anything to export
  if (R.isEmpty(idsToExport)) return { updatedIds: [], nonExistOnBitMap: [] };

  const componentsIds = await exportMany(consumer.scope, idsToExport, remote, undefined);
  const { updatedIds, nonExistOnBitMap } = _updateIdsOnBitMap(consumer.bitMap, componentsIds);
  await linkComponents(updatedIds, consumer);
  Analytics.setExtraData('num_components', componentsIds.length);
  // it is important to have consumer.onDestroy() before running the eject operation, we want the
  // export and eject operations to function independently. we don't want to lose the changes to
  // .bitmap file done by the export action in case the eject action has failed.
  await consumer.onDestroy();
  return { updatedIds, nonExistOnBitMap };
}

function _updateIdsOnBitMap(bitMap: BitMap, componentsIds: BitIds): { updatedIds: BitId[], nonExistOnBitMap: BitId[] } {
  const updatedIds = [];
  const nonExistOnBitMap = [];
  componentsIds.forEach((componentsId) => {
    const resultId = bitMap.updateComponentId(componentsId, true);
    if (resultId.hasVersion()) updatedIds.push(resultId);
    else nonExistOnBitMap.push(resultId);
  });
  return { updatedIds, nonExistOnBitMap };
}

async function getComponentsToExport(ids?: string[], consumer: Consumer, remote: string): Promise<BitIds> {
  const componentsList = new ComponentsList(consumer);
  const idsHaveWildcard = hasWildcard(ids);
  if (!ids || !ids.length || idsHaveWildcard) {
    loader.start(BEFORE_LOADING_COMPONENTS);
    const exportPendingComponents: BitIds = await componentsList.listExportPendingComponentsIds();
    const componentsToExport = idsHaveWildcard // $FlowFixMe ids are set at this point
      ? ComponentsList.filterComponentsByWildcard(exportPendingComponents, ids)
      : exportPendingComponents;
    const loaderMsg = componentsToExport.length > 1 ? BEFORE_EXPORTS : BEFORE_EXPORT;
    loader.start(loaderMsg);
    return componentsToExport;
  }
  const idsToExportP = ids.map(async (id) => {
    const parsedId = await getParsedId(consumer, id);
    const status = await consumer.getComponentStatusById(parsedId);
    // don't allow to re-export an exported component unless it's being exported to another scope
    if (!status.staged && parsedId.scope === remote) {
      throw new IdExportedAlready(parsedId.toString(), remote);
    }
    return parsedId;
  });
  loader.start(BEFORE_EXPORT); // show single export
  const idsToExport = await Promise.all(idsToExportP);
  return BitIds.fromArray(idsToExport);
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
  } catch (err) {
    // not in the consumer, just return the one parsed without the scope name
    return parsedId;
  }
}

async function linkComponents(ids: BitId[], consumer: Consumer): Promise<void> {
  // we don't have much of a choice here, we have to load all the exported components in order to link them
  // some of the components might be authored, some might be imported.
  // when a component has dists, we need the consumer-component object to retrieve the dists info.
  const components = await Promise.all(ids.map(id => consumer.loadComponentFromModel(id)));
  const nodeModuleLinker = new NodeModuleLinker(components, consumer, consumer.bitMap);
  await nodeModuleLinker.link();
}

async function ejectExportedComponents(componentsIds): Promise<EjectResults> {
  const consumer: Consumer = await loadConsumer(undefined, true);
  let ejectResults: EjectResults;
  try {
    const ejectComponents = new EjectComponents(consumer, componentsIds);
    ejectResults = await ejectComponents.eject();
  } catch (err) {
    logger.error(err);
    const ejectErr = `The components ${componentsIds.map(c => c.toString()).join(', ')} were exported successfully.
    However, the eject operation has failed due to an error: ${err.msg || err}`;
    throw new Error(ejectErr);
  }
  // run the consumer.onDestroy() again, to write the changes done by the eject action to .bitmap
  await consumer.onDestroy();
  return ejectResults;
}
