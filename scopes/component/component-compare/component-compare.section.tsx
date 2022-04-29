import { Section } from '@teambit/component';
import { ComponentCompare } from '@teambit/component/ui/component-compare';
import { MenuWidgetIcon } from '@teambit/ui-foundation.ui.menu-widget-icon';
import React from 'react';

export class ComponentCompareSection implements Section {
  // constructor() {}

  navigationLink = {
    href: '~compare',
    displayName: 'Compare',
    children: <MenuWidgetIcon icon="team-avatar" tooltipContent="Compare" />,
  };

  route = {
    path: '~compare',
    children: <ComponentCompare />,
  };

  order = 35;
}
