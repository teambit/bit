/** @flow */
import { loadConsumer } from '../../../consumer';

export default function getDriver() {
  return loadConsumer().then(consumer => consumer.driver);
}
