import semver from 'semver';
import { BitIds } from '../../../bit-id';
import Component from '../../../consumer/component';
import { AutoTagResult } from '../../../scope/component-ops/auto-tag';

export type TagResults = {
  taggedComponents: Component[];
  autoTaggedResults: AutoTagResult[];
  warnings: string[];
  newComponents: BitIds;
  isSoftTag: boolean;
  publishedPackages: string[];
};

export const NOTHING_TO_TAG_MSG = 'nothing to tag';
export const AUTO_TAGGED_MSG = 'auto-tagged dependents';

export type BasicTagParams = {
  message: string;
  ignoreNewestVersion: boolean;
  skipTests: boolean;
  skipAutoTag: boolean;
  build: boolean;
  soft: boolean;
  persist: boolean;
  disableTagAndSnapPipelines: boolean;
  forceDeploy: boolean;
  preReleaseId?: string;
  editor?: string;
  unmodified?: boolean;
};

export type TagParams = {
  exactVersion: string | undefined;
  releaseType?: semver.ReleaseType;
  ignoreIssues?: string;
  ignoreNewestVersion: boolean;
  ids: string[];
  all: boolean;
  snapped: boolean;
  scope?: string | boolean;
  includeImported: boolean;
  incrementBy: number;
} & BasicTagParams;
