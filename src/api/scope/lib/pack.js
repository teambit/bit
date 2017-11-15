/** @flow */
import { BitId } from '../../../bit-id';
import pack from '../../../scope/pack-ops/pack-in-scope';

export default function PackAction(id: string, path: string, directory: string, writeBitDependencies, links, override) {
  const realId = BitId.parse(id).toString();
  return pack({ id: realId, scopePath: path, directory, writeBitDependencies, links, override });
}
