import React from 'react';
import { Section } from '@teambit/component';
import { ComponentCompareUI } from './component-compare.ui.runtime';
import { ComponentCompareMenuWidget } from './component-compare-widget';

export class ComponentCompareSection implements Section {
  constructor(private componentCompare: ComponentCompareUI) {}

  navigationLink = {
    href: '~compare/compositions',
    displayName: 'Compare',
    children: <ComponentCompareMenuWidget />,
  };

  route = {
    path: '~compare',
    children: this.componentCompare.getComponentComparePage(),
  };

  order = 35;
}
