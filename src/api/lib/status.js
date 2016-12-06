/** @flow */
import { loadBox } from '../../box';

export default function status(): Promise<*> {
  return loadBox().then(box => 
    box.status()
  );
}
