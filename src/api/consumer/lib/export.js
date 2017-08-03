/** @flow */
import { Consumer, loadConsumer } from '../../../consumer';
import ConsumerComponent from '../../../consumer/component/consumer-component';
import ComponentsList from '../../../consumer/component/components-list';
import loader from '../../../cli/loader';
import { BEFORE_EXPORT } from '../../../cli/loader/loader-messages';
import { ComponentNotFound } from '../../../scope/exceptions';
import BitMap from '../../../consumer/bit-map';

export default async function exportAction(id?: string, remote: string, save: ?bool) {
  const consumer: Consumer = await loadConsumer();
  loader.start(BEFORE_EXPORT);
  let ids: string[];
  if (id) {
    ids = [id];
  } else { // export all
    const componentsList = new ComponentsList(consumer);
    ids = await componentsList.listExportPendingComponents();
  }
  // todo: what happens when some failed? we might consider avoid Promise.all
  const componentsDependencies = await consumer.scope.exportMany(ids, remote);

  const bitJsonDependencies = consumer.bitJson.getDependencies();
  const componentsP = componentsDependencies.map(async componentDependencies => {
    const component: ConsumerComponent = componentDependencies.component;
    if (save) {
      // add to bit.json only if the component is already there. So then the version will be updated. It's applicable
      // mainly when a component was imported first. For authored components, no need to save them in bit.json, they are
      // already in bit.map
      if (bitJsonDependencies
          .find(bitJsonDependency => bitJsonDependency.toString(false, true) === component.id.toString(false, true))) {
        await consumer.bitJson.addDependency(component.id).write({ bitDir: consumer.getPath() });
      }
    }
    return component;
  });

  const components = await Promise.all(componentsP);
  // todo: make sure runHook knows to deal with array of components
  // await consumer.driver.runHook('onExport', components);
  // todo: we should probably update bit.map with the new id, which includes the scope name
  const bitMap = await BitMap.load(consumer.getPath());
  components.map(component => bitMap.updateComponentScopeName(component.id));
  await bitMap.write();
  return components;
}
