/** @flow */
import { loadConsumer } from '../../consumer';

export default function push(id: string, remote: string) {
  return loadConsumer().then((consumer) => {
    return consumer.push(id, remote);
  });
} 
