/** @flow */
import { Consumer, loadConsumer } from '../../../consumer';
import ConsumerComponent from '../../../consumer/component/consumer-component';
import ComponentsList from '../../../consumer/component/components-list';
import loader from '../../../cli/loader';
import { BEFORE_EXPORT } from '../../../cli/loader/loader-messages';
import { ComponentNotFound } from '../../../scope/exceptions';
import { LOCAL_SCOPE_NOTATION } from '../../../constants';
import ExportWithoutThis from './exceptions/export-without-this';

export default async function exportAction(id?: string, remote: string, save: ?bool) {

  const exportComponent = async (consumer: Consumer, componentId: string) => {
    const component: ConsumerComponent = await consumer.exportAction(componentId, remote);
    if (save) {
      await consumer.bitJson.addDependency(component.id).write({ bitDir: consumer.getPath() });
      await consumer.driver.runHook('onExport', component);
    }

    return component;
  };

  const consumer = await loadConsumer();
  loader.start(BEFORE_EXPORT);

  if (id) {
    return exportComponent(consumer, id);
  }

  // export all
  const componentsList = new ComponentsList(consumer);
  const ids = await componentsList.listExportPendingComponents();
  // todo: what happens when some failed? we might consider avoid Promise.all
  // todo: improve performance. Load the remote only once, run the hook only once.
  // return Promise.all(ids.map(compId => exportComponent(consumer, compId)));

  const componentsDependencies = await consumer.scope.exportAllAction(ids, remote);

  const componentsP = componentsDependencies.map(async componentDependencies => {
    const component: ConsumerComponent = componentDependencies.component;
    if (save) {
      await consumer.bitJson.addDependency(component.id).write({ bitDir: consumer.getPath() });
    }
    return component;
  });

  const components = Promise.all(componentsP);
  // todo: make sure runHook knows to deal with array of components
  await consumer.driver.runHook('onExport', components);
  return components;
}
