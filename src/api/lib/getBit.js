/** @flow */
import { loadConsumer } from '../../consumer';
import Bit from '../../bit';

export default function getBit({ name }: { name: string }): Promise<Bit> {
  return loadConsumer().then(box => 
    box.get(name)
  );
}
