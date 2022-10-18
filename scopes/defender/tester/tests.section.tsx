import React from 'react';
import { Section } from '@teambit/component';
import { TestsPage } from '@teambit/defender.ui.test-page';
import { EmptyStateSlot } from './tester.ui.runtime';

export class TestsSection implements Section {
  constructor(private emptyStateSlot: EmptyStateSlot) {}

  route = {
    path: '~tests',
    element: <TestsPage emptyState={this.emptyStateSlot} />,
  };
  navigationLink = {
    href: '~tests',
    children: 'Tests',
  };
  order = 40;
}
