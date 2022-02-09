// import { ReactNode } from 'react';
import { SlotRegistry } from '@teambit/harmony';
import { NavLinkProps } from '@teambit/base-ui.routing.nav-link';
import type { ConsumeMethod } from '@teambit/ui-foundation.ui.use-box.menu';
import { LaneModel } from '@teambit/lanes.lanes.ui';
import { ComponentModel } from '../../ui';

export type NavPlugin = {
  props: NavLinkProps;
  order?: number;
};

export type OrderedNavigationSlot = SlotRegistry<NavPlugin>;

export type ConsumePlugin = (componentModel: ComponentModel, currentLane?: LaneModel) => ConsumeMethod | undefined;

export type ConsumeMethodSlot = SlotRegistry<ConsumePlugin[]>;
