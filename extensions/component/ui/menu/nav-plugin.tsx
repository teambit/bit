import { SlotRegistry } from '@teambit/harmony';
import { NavLinkProps } from '@teambit/react-router';

export type NavPlugin = {
  props: NavLinkProps;
  order?: number;
};

export type OrderedNavigationSlot = SlotRegistry<NavPlugin>;
