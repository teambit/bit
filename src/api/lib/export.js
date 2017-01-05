/** @flow */
import { loadConsumer } from '../../consumer';
import InlineId from '../../bit-inline-id';

export default function exportAction({ id }: { id: string, remote: string }) {
  return loadConsumer()
    .then(consumer => 
      consumer.export(InlineId.parse(id))
      // .then(bits =>
      //   Promise.all(
      //     bits.map(bit =>
      //       consumer.scope.ensureEnvironment(bit.bitJson)
      //       .then(() => bit)
      //     )
      //   )
      // ) 
    );
    // @TODO - maybe need to verify before export and not after, because error is thrown on export when the compiler is not exists
    // @TODO - push to remote 
}
