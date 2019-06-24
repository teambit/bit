/** @flow */
import runAndUpdateCi from '../../../scope/ci-ops/run-and-update-ci';

export default function CiUpdateAction(
  id: string,
  path: string,
  verbose: boolean,
  directory: ?string,
  keep?: boolean,
  noCache?: boolean
) {
  return runAndUpdateCi({ id, scopePath: path, verbose, directory, keep, noCache });
}
