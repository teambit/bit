/** @flow */
import { loadConsumer } from '../../../consumer';
import ConsumerComponent from '../../../consumer/component/consumer-component';
import loader from '../../../cli/loader';
import { BEFORE_EXPORT } from '../../../cli/loader/loader-messages';

export default function exportAction(id: string, remote: string, save: ?bool) {
  return loadConsumer().then((consumer) => {
    loader.start(BEFORE_EXPORT);
    return consumer.exportAction(id, remote)
    .then((component: ConsumerComponent) => {
      if (save) {
        return consumer.bitJson.addDependency(component.id)
        .write({ bitDir: consumer.getPath() })
        .then(() => component);
      }
      
      return component;
    });
  });
} 
