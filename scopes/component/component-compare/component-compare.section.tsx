import React from 'react';
import { Section } from '@teambit/component';
import { ComponentCompareIcon } from '@teambit/component.ui.component-compare.component-compare-icon';
import { ComponentCompareUI } from './component-compare.ui.runtime';

export class ComponentCompareSection implements Section {
  constructor(private componentCompare: ComponentCompareUI) {}

  navigationLink = {
    href: '~compare',
    displayName: 'Compare',
    children: <ComponentCompareIcon />,
  };

  route = {
    path: '~compare/*',
    element: this.componentCompare.getComponentComparePage(),
  };

  order = 35;
}
