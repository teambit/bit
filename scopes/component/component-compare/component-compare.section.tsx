import React from 'react';
import { Section } from '@teambit/component';
import { MenuWidgetIcon } from '@teambit/ui-foundation.ui.menu-widget-icon';
import { ComponentCompareUI } from './component-compare.ui.runtime';

export class ComponentCompareSection implements Section {
  constructor(private componentCompare: ComponentCompareUI) {}

  navigationLink = {
    href: '~compare',
    displayName: 'Compare',
    children: <MenuWidgetIcon icon="team-avatar" tooltipContent="Compare" />,
  };

  route = {
    path: '~compare',
    children: this.componentCompare.getComponentComparePage(),
  };

  order = 30;
}
