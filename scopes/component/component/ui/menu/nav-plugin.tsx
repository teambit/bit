import { SlotRegistry } from '@teambit/harmony';
import { NavLinkProps } from '@teambit/base-ui.routing.nav-link';

export type NavPlugin = {
  props: NavLinkProps;
  order?: number;
};

export type OrderedNavigationSlot = SlotRegistry<NavPlugin>;
