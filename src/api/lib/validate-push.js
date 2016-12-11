/** @flow */
import { loadConsumer } from '../../consumer';

export default function validatePush({ name, json }: { name: string, json: string }) {
  loadConsumer().then((consumer) => {
    console.log(consumer);
  });
}
