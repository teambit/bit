/** @flow */
import { loadConsumer } from '../../../consumer';

export default function list(scopeName: ?string): Promise<string[]> {
  return loadConsumer().then(consumer => 
    consumer.scope.list(scopeName)
  );
}
