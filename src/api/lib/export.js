/** @flow */
import { loadConsumer } from '../../consumer';

export default function exportAction(id: string, remote: string) {
  return loadConsumer().then((consumer) => {
    return consumer.exportAction(id, remote);
  });
} 
