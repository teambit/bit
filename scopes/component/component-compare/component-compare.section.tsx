import React from 'react';
import { Section } from '@teambit/component';
import { MenuWidgetIcon } from '@teambit/ui-foundation.ui.menu-widget-icon';
import { ComponentCompareUI } from './component-compare.ui.runtime';

export class ComponentCompareSection implements Section {
  constructor(
    private componentCompare: ComponentCompareUI,
    private pinned: boolean
  ) {}

  navigationLink = {
    href: '~compare',
    displayName: 'Compare',
    children: <MenuWidgetIcon icon="compare" tooltipContent="Compare" />,
    hideInMinimalMode: !this.pinned,
  };

  route = {
    path: '~compare/*',
    element: this.componentCompare.getComponentComparePage(),
  };

  order = this.pinned ? 20 : 35;
}
