/** @flow */
import R from 'ramda';
import { Consumer, loadConsumer } from '../../../consumer';
import ConsumerComponent from '../../../consumer/component/consumer-component';
import ComponentsList from '../../../consumer/component/components-list';
import loader from '../../../cli/loader';
import { BEFORE_EXPORT,BEFORE_EXPORTS } from '../../../cli/loader/loader-messages';
import BitMap from '../../../consumer/bit-map';
import { BitId } from '../../../bit-id'

export default async function exportAction(ids?: string[], remote: string, save: ?bool) {
  const consumer: Consumer = await loadConsumer();
  const componentsList = new ComponentsList(consumer);
  let idsToExport: string[];
  if (!ids || !ids.length) { // export all
    idsToExport = await componentsList.listExportPendingComponents();
    (idsToExport.length > 1) ? loader.start(BEFORE_EXPORTS) : loader.start(BEFORE_EXPORT);
  } else {
    const componentsFromBitMap = await componentsList.getFromBitMap();
    const idsFromBitMap = Object.keys(componentsFromBitMap);
    // the ids received from the CLI may be missing the scope-name, try to get the complete ids from bit.map
    idsToExport = ids.map((id) => {
      const parsedId = BitId.parse(id);
      if (parsedId.scope) return id;
      const match = idsFromBitMap.find(idStr => {
        return parsedId.toString() === BitId.parse(idStr).toStringWithoutScopeAndVersion();
      });
      return match || id;
    });
    loader.start(BEFORE_EXPORT); //show single export
  }
  // todo: what happens when some failed? we might consider avoid Promise.all
  // in case we don't have anything to export
  if (R.isEmpty(idsToExport)) return [];
  const componentsDependencies = await consumer.scope.exportMany(idsToExport, remote);
  const bitJsonDependencies = consumer.bitJson.getDependencies();
  const componentsP = componentsDependencies.map(async componentDependencies => {
    const component: ConsumerComponent = componentDependencies.component;
    if (save) {
      // add to bit.json only if the component is already there. So then the version will be updated. It's applicable
      // mainly when a component was imported first. For authored components, no need to save them in bit.json, they are
      // already in bit.map
      if (bitJsonDependencies.find(bitJsonDependency => bitJsonDependency
          .toStringWithoutVersion() === component.id.toStringWithoutVersion())) {
        await consumer.bitJson.addDependency(component.id).write({ bitDir: consumer.getPath() });
      }
    }
    return component;
  });

  const components = await Promise.all(componentsP);
  const bitMap = await BitMap.load(consumer.getPath());
  components.map(component => bitMap.updateComponentId(component.id));
  await bitMap.write();
  return components;
}
