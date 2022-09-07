import React from 'react';
import { Section } from '@teambit/component';
import { MenuWidgetIcon } from '@teambit/ui-foundation.ui.menu-widget-icon';
import { ComponentCompareUI } from './component-compare.ui.runtime';

export class ComponentCompareSection implements Section {
  constructor(private componentCompare: ComponentCompareUI) {}

  navigationLink = {
    href: '~compare',
    displayName: 'Compare',
    children: <MenuWidgetIcon icon="compare" tooltipContent="Compare" />,
  };

  route = {
    path: '~compare/*',
    element: this.componentCompare.getComponentComparePage(),
  };

  order = 35;
}
