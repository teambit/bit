import React from 'react';
import { MenuWidgetIcon } from '@teambit/ui-foundation.ui.menu-widget-icon';
import { Section } from '@teambit/component';
import { ComponentCompareUI } from './component-compare.ui.runtime';

export class AspectsCompareSection implements Section {
  constructor(private compareUI: ComponentCompareUI) {}

  navigationLink = {
    href: 'aspects',
    displayName: 'Aspects',
    children: <MenuWidgetIcon icon="configuration" tooltipContent="Configuration" />,
  };

  route = {
    path: 'aspects/*',
    element: this.compareUI.getAspectsComparePage(),
  };

  order: 60;
}
