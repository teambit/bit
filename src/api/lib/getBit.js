/** @flow */
import { loadBox } from '../../box';
import Bit from '../../bit';

export default function getBit({ name }: { name: string }): Promise<Bit> {
  return loadBox().then(box => 
    box.get(name)
  );
}
