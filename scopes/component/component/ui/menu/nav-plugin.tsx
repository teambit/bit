import { ReactNode } from 'react';
import { SlotRegistry } from '@teambit/harmony';
import { NavLinkProps } from '@teambit/base-ui.routing.nav-link';
import { ComponentModel } from '../../ui';

export type NavPlugin = {
  props: NavLinkProps;
  order?: number;
};

export type OrderedNavigationSlot = SlotRegistry<NavPlugin>;

export type ConsumePlugin = (componentModel: ComponentModel) => {
  Title?: ReactNode;
  Component?: ReactNode;
  order?: number;
};

export type OrderedConsumeSlot = SlotRegistry<ConsumePlugin[]>;
