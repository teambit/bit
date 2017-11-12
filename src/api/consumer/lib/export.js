/** @flow */
import R from 'ramda';
import { Consumer, loadConsumer } from '../../../consumer';
import ConsumerComponent from '../../../consumer/component/consumer-component';
import ComponentsList from '../../../consumer/component/components-list';
import loader from '../../../cli/loader';
import { BEFORE_EXPORT, BEFORE_EXPORTS } from '../../../cli/loader/loader-messages';
import BitMap from '../../../consumer/bit-map';
import { BitId } from '../../../bit-id';
import IdExportedAlready from './exceptions/id-exported-already';

async function getComponentsToExport(ids?: string[], consumer: Consumer, remote: string) {
  const componentsList = new ComponentsList(consumer);
  if (!ids || !ids.length) {
    // export all
    const exportPendingComponents = await componentsList.listExportPendingComponents();
    exportPendingComponents.length > 1 ? loader.start(BEFORE_EXPORTS) : loader.start(BEFORE_EXPORT);
    return exportPendingComponents;
  }
  const componentsFromBitMap = await componentsList.getFromBitMap();
  const idsFromBitMap = Object.keys(componentsFromBitMap);
  const idsFromObjects = await componentsList.idsFromObjects();
  // the ids received from the CLI may be missing the scope-name, try to get the complete ids from bit.map
  const idsToExport = ids.map((id) => {
    const parsedId = BitId.parse(id);
    if (parsedId.scope) return id;
    const match = idsFromBitMap.find((idStr) => {
      return parsedId.toString() === BitId.parse(idStr).toStringWithoutScopeAndVersion();
    });
    if (match) {
      const matchParsed = BitId.parse(match);
      // The match received from bit.map has a version number and if this version is the same as the component from the
      // objects, it means that this version was already exported. Otherwise, the version from bit.map would be lower
      // than the one from the objects, because we update bit.map after the export is completed.
      // It is fine though to re-export a component to another scope.
      if (idsFromObjects.includes(match) && matchParsed.scope === remote) {
        throw new IdExportedAlready(match, remote);
      }
      return BitId.parse(match).toStringWithoutVersion();
    }
    return id;
  });
  loader.start(BEFORE_EXPORT); // show single export
  return idsToExport;
}

export default (async function exportAction(ids?: string[], remote: string, save: ?boolean) {
  const consumer: Consumer = await loadConsumer();
  const idsToExport = await getComponentsToExport(ids, consumer, remote);
  // todo: what happens when some failed? we might consider avoid Promise.all
  // in case we don't have anything to export
  if (R.isEmpty(idsToExport)) return [];
  const componentsIds = await consumer.scope.exportMany(idsToExport, remote);
  const bitJsonDependencies = consumer.bitJson.getDependencies();
  const componentsIdsP = componentsIds.map(async (componentId: BitId) => {
    if (save) {
      // add to bit.json only if the component is already there. So then the version will be updated. It's applicable
      // mainly when a component was imported first. For authored components, no need to save them in bit.json, they are
      // already in bit.map
      if (
        bitJsonDependencies.find(
          bitJsonDependency => bitJsonDependency.toStringWithoutVersion() === componentId.toStringWithoutVersion()
        )
      ) {
        await consumer.bitJson.addDependency(componentId).write({ bitDir: consumer.getPath() });
      }
    }
    return componentId;
  });

  await Promise.all(componentsIdsP);
  const bitMap = await BitMap.load(consumer.getPath());
  componentsIds.map(componentsId => bitMap.updateComponentId(componentsId));
  await bitMap.write();
  return componentsIds;
});
