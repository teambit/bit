/** @flow */
import { loadConsumer } from '../../consumer';

export default function exportAction({ name, remote }: { name: string, remote: string}) {
  return loadConsumer()
    .then(consumer => consumer.export(name));
    // @TODO - push to remote 
}
