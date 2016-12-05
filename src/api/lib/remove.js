
/** @flow */
import { loadBox } from '../../box';

export default function remove(name: string, { inline }: { inline: boolean }) {
  return loadBox().removeBit({ name }, { inline });
}
