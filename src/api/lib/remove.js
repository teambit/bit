/** @flow */
import { loadBox } from '../../box';

export default function create(name: string) {
  return loadBox().removeBit({ name });
}
