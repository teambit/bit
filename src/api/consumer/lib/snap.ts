import { BitIds } from '../../../bit-id';
import Component from '../../../consumer/component';
import { AutoTagResult } from '../../../scope/component-ops/auto-tag';

export type SnapResults = {
  snappedComponents: Component[];
  autoSnappedResults: AutoTagResult[];
  warnings: string[];
  newComponents: BitIds;
  laneName: string | null; // null if default
};
