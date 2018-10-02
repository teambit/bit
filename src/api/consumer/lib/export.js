/** @flow */
import R from 'ramda';
import { Consumer, loadConsumer } from '../../../consumer';
import ComponentsList from '../../../consumer/component/components-list';
import loader from '../../../cli/loader';
import { BEFORE_EXPORT, BEFORE_EXPORTS } from '../../../cli/loader/loader-messages';
import { BitId, BitIds } from '../../../bit-id';
import IdExportedAlready from './exceptions/id-exported-already';
import { linkComponentsToNodeModules } from '../../../links';
import logger from '../../../logger/logger';
import { Analytics } from '../../../analytics/analytics';
import ejectComponents from '../../../consumer/component-ops/eject-components';
import type { EjectResults } from '../../../consumer/component-ops/eject-components';

export default (async function exportAction(ids?: string[], remote: string, save: ?boolean, eject: ?boolean) {
  const componentsIds = await exportComponents(ids, remote, save);
  let ejectResults;
  if (eject) ejectResults = await ejectExportedComponents(componentsIds);
  return { componentsIds, ejectResults };
});

async function exportComponents(ids?: string[], remote: string, save: ?boolean): Promise<BitId[]> {
  const consumer: Consumer = await loadConsumer();
  const idsToExport = await getComponentsToExport(ids, consumer, remote);
  // todo: what happens when some failed? we might consider avoid Promise.all
  // in case we don't have anything to export
  if (R.isEmpty(idsToExport)) return [];
  const componentsIds = await consumer.scope.exportMany(idsToExport, remote, undefined);
  if (save) await addToBitJson(componentsIds, consumer);
  componentsIds.map(componentsId => consumer.bitMap.updateComponentId(componentsId));
  await linkComponents(componentsIds, consumer);
  Analytics.setExtraData('num_components', componentsIds.length);
  // it is important to have consumer.onDestroy() before running the eject operation, we want the
  // export and eject operations to function independently. we don't want to lose the changes to
  // .bitmap file done by the export action in case the eject action has failed.
  await consumer.onDestroy();
  return componentsIds;
}

async function getComponentsToExport(ids?: string[], consumer: Consumer, remote: string): Promise<BitIds> {
  const componentsList = new ComponentsList(consumer);
  if (!ids || !ids.length) {
    // export all
    const exportPendingComponents: BitIds = await componentsList.listExportPendingComponentsIds();
    if (exportPendingComponents.length > 1) loader.start(BEFORE_EXPORTS);
    else loader.start(BEFORE_EXPORT);
    return exportPendingComponents;
  }
  const idsToExportP = ids.map(async (id) => {
    const parsedId = consumer.getParsedId(id);
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

async function addToBitJson(ids: BitId[], consumer: Consumer) {
  const bitJsonDependencies = consumer.bitJson.getDependencies();
  const componentsIdsP = ids.map(async (componentId: BitId) => {
    // add to bit.json only if the component is already there. So then the version will be updated. It's applicable
    // mainly when a component was imported first. For authored components, no need to save them in bit.json, they are
    // already in bit.map
    if (bitJsonDependencies.searchWithoutVersion(componentId)) {
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

async function ejectExportedComponents(componentsIds): Promise<EjectResults> {
  const consumer: Consumer = await loadConsumer();
  let ejectResults: EjectResults;
  try {
    ejectResults = await ejectComponents(consumer, componentsIds);
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
