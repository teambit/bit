/** @flow */
import { loadConsumer } from '../../../consumer';
import ConsumerComponent from '../../../consumer/component/consumer-component';

export default function exportAction(id: string, remote: string, save: ?bool) {
  return loadConsumer().then((consumer) => {
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
