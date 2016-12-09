/** @flow */
import { loadConsumer } from '../../consumer';

export default function create(name: string): Promise<boolean> {
  return loadConsumer().then(consumer =>  
    consumer.createBit({ name })
  );
}
