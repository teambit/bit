import React from 'react';
import { Section } from '@teambit/component';
import { ComponentCompareMenuWidget } from './component-compare-widget';
import { ComponentCompareUI } from './component-compare.ui.runtime';

export class ComponentCompareSection implements Section {
  constructor(private componentCompare: ComponentCompareUI) {}

  navigationLink = {
    href: '~compare',
    displayName: 'Compare',
    children: <ComponentCompareMenuWidget />,
  };

  route = {
    path: '~compare/*',
    element: this.componentCompare.getComponentComparePage(),
  };

  order = 35;
}
