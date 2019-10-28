import runAndUpdateCi from '../../../scope/ci-ops/run-and-update-ci';

export default function CiUpdateAction(
  id: string,
  path: string,
  verbose: boolean,
  directory?: string,
  keep = false,
  noCache = false
) {
  return runAndUpdateCi({ id, scopePath: path, verbose, directory, keep, noCache });
}
