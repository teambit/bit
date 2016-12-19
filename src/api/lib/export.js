/** @flow */
import { loadConsumer } from '../../consumer';
import InlineId from '../../bit-inline-id';

export default function exportAction({ id }: { id: string, remote: string}) {
  return loadConsumer()
    .then(consumer => consumer.export(InlineId.parse(id)));
    // @TODO - push to remote 
}
