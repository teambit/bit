/** @flow */
import { loadBox } from '../../box';

export default function create(name: string): Promise<boolean> {
  return loadBox().then(box => 
    box.createBit({ name })
  );
}
