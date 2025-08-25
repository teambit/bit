import React from 'react';
import type { Section } from '@teambit/component';
import { TestsPage } from '@teambit/defender.ui.test-page';
import type { EmptyStateSlot } from './tester.ui.runtime';

export class TestsSection implements Section {
  constructor(private emptyStateSlot: EmptyStateSlot) {}

  route = {
    path: '~tests',
    element: <TestsPage emptyState={this.emptyStateSlot} />,
  };
  navigationLink = {
    href: '~tests',
    children: 'Tests',
    hideInMinimalMode: true,
  };
  order = 40;
}
