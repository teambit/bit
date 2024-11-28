import { SlotRegistry } from '@teambit/harmony';
import type { LinkProps } from '@teambit/base-react.navigation.link';
import type { ConsumeMethod } from '@teambit/ui-foundation.ui.use-box.menu';
import { LaneModel } from '@teambit/lanes.ui.models.lanes-model';
import { ComponentID } from '@teambit/component-id';
import { ComponentModel } from '../component-model';

export type NavPluginProps = {
  displayName?: string;
  ignoreQueryParams?: boolean;
  hideInMinimalMode?: boolean;
} & LinkProps;

export type NavPlugin = {
  props: NavPluginProps;
  order?: number;
};

export type OrderedNavigationSlot = SlotRegistry<NavPlugin>;
export type ConsumePluginOptions = {
  viewedLane?: LaneModel;
  hide?: boolean;
  disableInstall?: boolean;
};

export type ConsumePluginProps = {
  id: ComponentID;
  packageName: string;
  latest?: string;
  // @deprecated - pass id, packageName and latest instead via props
  componentModel?: ComponentModel;
  options?: ConsumePluginOptions;
  authToken?: string;
};

export type ConsumePlugin = (props: ConsumePluginProps) => ConsumeMethod | undefined;

export type ConsumeMethodSlot = SlotRegistry<ConsumePlugin[]>;
