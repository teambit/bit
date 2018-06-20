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
import { Analytics } from '../../../analytics/analytics';

async function getComponentsToExport(ids?: string[], consumer: Consumer, remote: string): Promise<string[]> {
  const componentsList = new ComponentsList(consumer);
  if (!ids || !ids.length) {
    // export all
    const exportPendingComponents = await componentsList.listExportPendingComponents();
    if (exportPendingComponents.length > 1) loader.start(BEFORE_EXPORTS);
    else loader.start(BEFORE_EXPORT);
    return exportPendingComponents;
  }
  const componentsFromBitMap = componentsList.getFromBitMap();
  const idsFromBitMap = Object.keys(componentsFromBitMap);
  // the ids received from the CLI may be missing the scope-name, try to get the complete ids from bit.map
  const idsToExport = ids.map(async (id) => {
    const parsedId = BitId.parse(id);
    if (parsedId.scope) return id;
    const match = idsFromBitMap.find((idStr) => {
      return parsedId.toString() === BitId.parse(idStr).toStringWithoutScopeAndVersion();
    });
    if (match) {
      const matchParsed = BitId.parse(match);
      const status = await consumer.getComponentStatusById(matchParsed);
      // don't allow to re-export an exported component unless it's being exported to another scope
      if (!status.staged && matchParsed.scope === remote) {
        throw new IdExportedAlready(match, remote);
      }
      return matchParsed.toStringWithoutVersion();
    }
    return id;
  });
  loader.start(BEFORE_EXPORT); // show single export
  return Promise.all(idsToExport);
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
      await consumer.onDestroy();
      return results;
    } catch (err) {
      logger.error(err);
      ejectErr = `The components ${componentsIds.map(c => c.toString()).join(', ')} were exported successfully.
      However, the eject operation has failed due to an error: ${err.msg || err}`;
      // it might leave a damaged workspace behind. however, there are not much we can do to avoid
      // it. previously, in case of eject failure, we continued the linkComponent, but then, a new
      // bug introduced where bit-removed deleted directly imported dependencies, which fails
      // link-components afterwards and ended up having more confusion about the failure
      return Promise.reject(ejectErr);
    }
  }
  if (save) await addToBitJson(componentsIds, consumer);
  componentsIds.map(componentsId => consumer.bitMap.updateComponentId(componentsId));
  await linkComponents(componentsIds, consumer);
  Analytics.setExtraData('num_components', componentsIds.length);
  await consumer.onDestroy();
  return componentsIds;
});
