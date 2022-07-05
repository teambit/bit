import { manifestsMap } from './manifests';

export type BitDeps = [];

export type BitConfig = {
  cwd: string;
  /**
   * if set, during bit bootstrap it checks whether the current bit-version semver.satisfies this version.
   */
  engine?: string;
  /**
   * if true, it throws an error when "engine" not satisfied. otherwise, it just warns.
   */
  engineStrict?: boolean;
};

export async function provideBit() {
  return {
    manifestsMap,
  };
}
