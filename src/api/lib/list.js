/** @flow */
import { loadBox } from '../../box';

export default function list({ inline }: any): Promise<string[]> {
  return loadBox().then(box => 
    box.list({ inline })
  );
}
