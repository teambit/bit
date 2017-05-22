/** @flow */
import { loadConsumer } from '../../../consumer';
import ConsumerComponent from '../../../consumer/component/consumer-component';
import loader from '../../../cli/loader';
import { BEFORE_EXPORT } from '../../../cli/loader/loader-messages';
import { ComponentNotFound } from '../../../scope/exceptions';
import { LOCAL_SCOPE_NOTATION } from '../../../constants';
import ExportWithoutThis from './exceptions/export-without-this';

export default function exportAction(id: string, remote: string, save: ?bool) {
  return loadConsumer().then((consumer) => {
    loader.start(BEFORE_EXPORT);
    return consumer.exportAction(id, remote)
    .catch((err) => {
      if (err instanceof ComponentNotFound && !id.startsWith(LOCAL_SCOPE_NOTATION)) {
        throw new ExportWithoutThis(id, remote);
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
  });
}
