import React from 'react';
import { Section } from '@teambit/component';
import { ComponentCompareDependencies } from '@teambit/component.ui.component-compare-dependencies';

export class GraphCompareSection implements Section {
  navigationLink = {
    href: 'dependencies',
    children: 'Dependencies',
    order: 3,
  };

  route = {
    path: 'dependencies/*',
    element: <ComponentCompareDependencies />,
  };
}
