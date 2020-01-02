import { BitId } from '../../bit-id';
import { LaneComponent } from '../../scope/models/lane';
import { MergeStrategy } from '../versions-ops/merge-version';
import { Consumer } from '..';
import checkoutVersion from '../versions-ops/checkout-version';

export type SwitchProps = {
  create: boolean;
  laneName: string;
  remoteScope?: string;
  ids?: BitId[];
  merge: boolean;
  mergeStrategy: MergeStrategy | null | undefined;
  verbose: boolean;
  skipNpmInstall: boolean;
  ignoreDist: boolean;
  ignorePackageJson: boolean;
  existingOnWorkspaceOnly: boolean;
  localLaneName?: string;
  remoteLaneScope?: string;
  remoteLaneName?: string;
  remoteLaneComponents?: LaneComponent[];
  localTrackedLane?: string;
  newLaneName?: string;
};

export default async function switchLanes(consumer: Consumer, switchProps: SwitchProps) {
  const checkoutProps = {
    ...switchProps,
    isLane: true,
    promptMergeOptions: false,
    writeConfig: false,
    reset: false,
    all: false
  };
  return checkoutVersion(consumer, checkoutProps);
}
