import { SlotRegistry } from '@teambit/harmony';
import { NavLinkProps } from '@teambit/ui.react-router.nav-link';

export type NavPlugin = {
  props: NavLinkProps;
  order?: number;
};

export type OrderedNavigationSlot = SlotRegistry<NavPlugin>;
