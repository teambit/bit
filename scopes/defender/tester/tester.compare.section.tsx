import React from 'react';
import { Section } from '@teambit/component';
import { CompareTests } from '@teambit/defender.ui.test-compare';
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
    element: <CompareTests emptyState={this.emptyStateSlot} />,
  };
}
