/** @flow */
import R from 'ramda';
import { Consumer, loadConsumer } from '../../../consumer';
import ComponentsList from '../../../consumer/component/components-list';
import loader from '../../../cli/loader';
import { BEFORE_EXPORT, BEFORE_EXPORTS, BEFORE_LOADING_COMPONENTS } from '../../../cli/loader/loader-messages';
import { BitId, BitIds } from '../../../bit-id';
import { Analytics } from '../../../analytics/analytics';
import hasWildcard from '../../../utils/string/has-wildcard';
import { NodeModuleLinker } from '../../../links';
import BitMap from '../../../consumer/bit-map/bit-map';
import forkComponents from '../../../scope/component-ops/fork-scope-components';

export default (async function forkAction(
  ids?: string[],
  remote: string,
  all: boolean,
  dependencies: boolean,
  codeMod: boolean
) {
  const consumer: Consumer = await loadConsumer();
  const idsToFork = await getComponentsToFork(ids, consumer, remote, all);
  console.log('TCL: forkAction -> idsToFork', idsToFork);
  if (R.isEmpty(idsToFork)) {
    return { componentsIds: [], nonExistOnBitMap: [] };
  }
  const componentsIds = await forkComponents({ scope: consumer.scope, ids: idsToFork, remote, dependencies });
  console.log('TCL: forkAction -> componentsIds', componentsIds);
  const { updatedIds, nonExistOnBitMap } = _updateIdsOnBitMap(consumer.bitMap, componentsIds);
  await linkComponents(updatedIds, consumer);
  Analytics.setExtraData('num_components', componentsIds.length);
  // it is important to have consumer.onDestroy() before running the eject operation, we want the
  // export and eject operations to function independently. we don't want to lose the changes to
  // .bitmap file done by the export action in case the eject action has failed.
  await consumer.onDestroy();
  return { componentsIds: updatedIds, nonExistOnBitMap };
});

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

async function getComponentsToFork(
  ids?: Array<string>,
  consumer: Consumer,
  remote: string,
  all: boolean
): Promise<BitIds> {
  const componentsList = new ComponentsList(consumer);
  const idsHaveWildcard = hasWildcard(ids);
  if (!ids || !ids.length || idsHaveWildcard) {
    loader.start(BEFORE_LOADING_COMPONENTS);
    const forkPendingComponents: BitIds = all
      ? await componentsList.listNonNewComponentsIds()
      : await componentsList.listExportPendingComponentsIds();
    const componentsToExport = idsHaveWildcard
      ? ComponentsList.filterComponentsByWildcard(forkPendingComponents, ids)
      : forkPendingComponents;
    const loaderMsg = componentsToExport.length > 1 ? BEFORE_EXPORTS : BEFORE_EXPORT;
    loader.start(loaderMsg);
    return componentsToExport;
  }
  const idsToForkP = ids.map(id => getParsedId(consumer, id));
  loader.start(BEFORE_EXPORT);
  const idsToFork = await Promise.all(idsToForkP);
  return BitIds.fromArray(idsToFork);
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
