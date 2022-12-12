import React from 'react';
import { Section } from '@teambit/component';
import { DependenciesCompare } from '@teambit/graph';

export class GraphCompareSection implements Section {
  navigationLink = {
    href: 'dependencies',
    children: 'Dependencies',
  };

  route = {
    path: 'dependencies/*',
    element: <DependenciesCompare />,
  };

  order = 25;
}
