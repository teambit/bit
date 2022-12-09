import React from 'react';
import { Section } from '@teambit/component';
import { MenuWidgetIcon } from '@teambit/ui-foundation.ui.menu-widget-icon';
import { ComponentCompareUI } from './component-compare.ui.runtime';

export class CompareChangelogSection implements Section {
  constructor(private compareUI: ComponentCompareUI) {}

  navigationLink = {
    href: 'changelog',
    children: <MenuWidgetIcon icon="changelog" tooltipContent="Change log" />,
    displayName: 'Change log',
  };

  route = {
    path: 'changelog/*',
    element: this.compareUI.getChangelogComparePage(),
  };

  order = 70;
  widget = true;
}
