/** @flow */
import { loadScope } from '../../../scope';
import { BitId } from '../../../bit-id';
import runAndUpdateCi from '../../../scope/ci-ops/run-and-update-ci';

export default function CiUpdateAction(id: string, path: string) {
  return loadScope(path)
    .then((scope) => {
      const realId = BitId.parse(id, scope.name).toString();
      return runAndUpdateCi({ id: realId, scopePath: path });
    });
}
