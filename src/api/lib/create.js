/** @flow */
import { loadConsumer } from '../../consumer';

export default function create(id: string): Promise<boolean> {
  return loadConsumer().then(consumer =>  
    consumer.createBit({ id })
  );
}
