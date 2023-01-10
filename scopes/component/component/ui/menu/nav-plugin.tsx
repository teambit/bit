import { SlotRegistry } from '@teambit/harmony';
import type { LinkProps } from '@teambit/base-react.navigation.link';
import type { ConsumeMethod } from '@teambit/ui-foundation.ui.use-box.menu';
import { LaneModel } from '@teambit/lanes.ui.models.lanes-model';
import { ComponentModel } from '../../ui';

export type NavPluginProps = {
  displayName?: string;
  ignoreStickyQueryParams?: boolean;
} & LinkProps;

export type NavPlugin = {
  props: NavPluginProps;
  order?: number;
};

export type OrderedNavigationSlot = SlotRegistry<NavPlugin>;
export type ConsumePluginOptions = {
  currentLane?: LaneModel;
};

export type ConsumePlugin = (
  componentModel: ComponentModel,
  options?: ConsumePluginOptions
) => ConsumeMethod | undefined;

export type ConsumeMethodSlot = SlotRegistry<ConsumePlugin[]>;
