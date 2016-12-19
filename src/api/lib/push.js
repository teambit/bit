/** @flow */
import { loadConsumer } from '../../consumer';

export default function push() {
  return loadConsumer().then((consumer) => {
    consumer.push();
  });
} 
