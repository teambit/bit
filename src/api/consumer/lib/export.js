/** @flow */
import R from 'ramda';
import { Consumer, loadConsumer } from '../../../consumer';
import ComponentsList from '../../../consumer/component/components-list';
import loader from '../../../cli/loader';
import { BEFORE_EXPORT, BEFORE_EXPORTS } from '../../../cli/loader/loader-messages';
import { BitId } from '../../../bit-id';
import IdExportedAlready from './exceptions/id-exported-already';
import { linkComponentsToNodeModules } from '../../../links';
import logger from '../../../logger/logger';

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

async function addToBitJson(ids: BitId[], consumer: Consumer) {
  const bitJsonDependencies = consumer.bitJson.getDependencies();
  const componentsIdsP = ids.map(async (componentId: BitId) => {
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
    return componentId;
  });

  return Promise.all(componentsIdsP);
}

async function linkComponents(ids: BitId[], consumer: Consumer): Promise<void> {
  // we don't have much of a choice here, we have to load all the exported components in order to link them
  // some of the components might but authored, some might be imported.
  // when a component has dists, we need the consumer-component object to retrieve the dists info.
  const { components } = await consumer.loadComponents(ids);
  linkComponentsToNodeModules(components, consumer);
}

export default (async function exportAction(ids?: string[], remote: string, save: ?boolean, eject: ?boolean) {
  const consumer: Consumer = await loadConsumer();
  const idsToExport = await getComponentsToExport(ids, consumer, remote);
  // todo: what happens when some failed? we might consider avoid Promise.all
  // in case we don't have anything to export
  if (R.isEmpty(idsToExport)) return [];
  const componentsIds = await consumer.scope.exportMany(idsToExport, remote, undefined, eject);
  let ejectErr;
  if (eject) {
    try {
      const results = await consumer.eject(componentsIds);
      return results;
    } catch (err) {
      logger.error(err);
      ejectErr = `The components ${componentsIds.map(c => c.toString()).join(', ')} were exported successfully.
      However, the eject operation has failed due to an error: ${err}`;
    }
  }
  if (save) await addToBitJson(componentsIds, consumer);
  componentsIds.map(componentsId => consumer.bitMap.updateComponentId(componentsId));
  await consumer.bitMap.write();
  await linkComponents(componentsIds, consumer);
  if (ejectErr) return Promise.reject(ejectErr);
  return componentsIds;
});
