import { ReleaseType } from 'semver';

export type SemverBumpType = 'patch' | 'minor' | 'major';

export type SnapOptions = {
  id?: string;
  all?: boolean;
  message?: string;
  releaseType?: ReleaseType;
  exactVersion?: string;
  force?: boolean;
  verbose?: boolean;
  ignoreMissingDependencies?: boolean;
  ignoreUnresolvedDependencies?: boolean;
  ignoreNewestVersion?: boolean;
  skipTests?: boolean;
  skipAutoTag?: boolean;
  snapAllInScope?: boolean;
};
