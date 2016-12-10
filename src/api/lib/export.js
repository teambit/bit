/** @flow */
import { loadConsumer } from '../../consumer';

export default function exportAction({ name, remote }: { name: string, remote: string}) {
  return loadConsumer().then((consumer) => {
    return consumer.export(name, remote);
  });
}
