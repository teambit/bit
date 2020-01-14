export type SemverBumpType = 'patch' | 'minor' | 'major';

export type SnapOptions = {
  all?: boolean;
  message?: string;
  bumpType?: SemverBumpType;
  exactVersion?: string;
  force?: boolean;
  verbose?: boolean;
  ignoreMissingDependencies?: boolean;
  ignoreUnresolvedDependencies?: boolean;
  ignoreNewestVersion?: boolean;
  skipTests?: boolean;
  skipAutoTag?: boolean; // Maybe should be on the workspace
  snapAllInScope?: string; // Maybe should be on the workspace
};
