/** @flow */
import { loadConsumer } from '../../../consumer';

export default function listInline(): Promise<string[]> {
  return loadConsumer().then(consumer => 
    consumer.listInline()
  );
}
