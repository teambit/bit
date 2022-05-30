import React from 'react';
import { Section } from '@teambit/component';
import { ComponentCompareTests } from '@teambit/component.ui.component-compare-tests';
import { EmptyStateSlot } from './tester.ui.runtime';

export class TesterCompareSection implements Section {
  constructor(private emptyStateSlot: EmptyStateSlot) {}
 
  navigationLink = {
    href: 'tests',
    children: 'Tests',
    order: 4,
  };

  route = {
    path: 'tests/*',
    element: <ComponentCompareTests emptyState={this.emptyStateSlot} />,
  };
}
