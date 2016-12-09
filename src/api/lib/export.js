/** @flow */
import { loadConsumer } from '../../consumer';

export default function exportAction({ name, remote }: { name: string, remote: string}) {
  loadConsumer().then((box) => {
    console.log(box);
  });
}
