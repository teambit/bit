/** @flow */
import { loadConsumer } from '../../consumer';
import Bit from '../../bit';

export default function build({ name }: { name: string }): Promise<Bit> {
  return loadConsumer().then(consumer => 
    consumer.get(name).then(
      bit => bit.build()
    )
  );
}
