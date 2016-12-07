/** @flow */
import { loadBox } from '../../box';

export default function exportAction({ name, remote }: { name: string, remote: string}) {
  loadBox().then((box) => {
    console.log(box);
  });
}
