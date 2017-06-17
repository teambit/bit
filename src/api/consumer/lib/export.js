/** @flow */
import { Consumer, loadConsumer } from '../../../consumer';
import ConsumerComponent from '../../../consumer/component/consumer-component';
import loader from '../../../cli/loader';
import { BEFORE_EXPORT } from '../../../cli/loader/loader-messages';
import { ComponentNotFound } from '../../../scope/exceptions';
import { LOCAL_SCOPE_NOTATION } from '../../../constants';
import ExportWithoutThis from './exceptions/export-without-this';

export default function exportAction(id?: string, remote: string, save: ?bool) {

  const exportComponent = (consumer: Consumer, componentId: string) => {
    return consumer.exportAction(componentId, remote)
      .catch((err) => {
        if (err instanceof ComponentNotFound && !id.startsWith(LOCAL_SCOPE_NOTATION)) {
          throw new ExportWithoutThis(componentId, remote);
        }
        throw err;
      })
      .then((component: ConsumerComponent) => {
        if (save) {
          return consumer.bitJson.addDependency(component.id)
            .write({ bitDir: consumer.getPath() })
            .then(() => consumer.driver.runHook('onExport', component))
            .then(() => component);
        }

        return component;
      });
  };

  return loadConsumer().then((consumer) => {
    loader.start(BEFORE_EXPORT);

    if (id) {
      return exportComponent(consumer, id);
    }
    // export all
    return consumer.listExportPendingComponents().then((ids) => {
      // todo: what happens when some failed? we might consider avoid Promise.all
      // todo: improve performance. Load the remote only once, run the hook only once.
      return Promise.all(ids.map(compId => exportComponent(consumer, compId)));
    });
  });
}
