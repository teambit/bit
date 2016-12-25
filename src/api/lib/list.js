/** @flow */
import { loadConsumer } from '../../consumer';

export default function list(): Promise<string[]> {
  return loadConsumer().then(consumer => 
    consumer.listInline()
  );
}
