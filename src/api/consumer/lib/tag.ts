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
