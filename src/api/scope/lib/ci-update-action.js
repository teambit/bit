/** @flow */
import { BitId } from '../../../bit-id';
import runAndUpdateCi from '../../../scope/ci-ops/run-and-update-ci';

export default function CiUpdateAction(id: string, path: string) {
  const realId = BitId.parse(id).toString();
  return runAndUpdateCi({ id: realId, scopePath: path });
}
