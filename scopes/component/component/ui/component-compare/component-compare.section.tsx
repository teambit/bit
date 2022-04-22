import React from 'react';
import { MenuWidgetIcon } from '@teambit/ui-foundation.ui.menu-widget-icon';
import { Section } from '@teambit/component';
import { ComponentCompare } from './component-compare';

export class ComponentCompareSection implements Section {
  route = {
    path: '~compare',
    children: <ComponentCompare />,
  };
  navigationLink = {
    href: '~compare',
    children: <MenuWidgetIcon icon="team-avatar" tooltipContent="Compare" />,
    displayName: 'Compare',
  };
  order = 60;
}
