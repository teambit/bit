/** @flow */
import { BitId } from '../../../bit-id';
import runAndUpdateCi from '../../../scope/ci-ops/run-and-update-ci';

export default function CiUpdateAction(id: string, path: string, verbose: boolean, directory: ?string, keep?: boolean) {
  const realId = BitId.parse(id).toString();
  return runAndUpdateCi({ id: realId, scopePath: path, verbose, directory, keep });
}
