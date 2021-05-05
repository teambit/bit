import React from 'react';
import { Section } from '@teambit/component';
import { TestsPage } from './ui/tests-page';
import { EmptyStateSlot } from './tester.ui.runtime';

export class TestsSection implements Section {
  constructor(private emptyStateSlot: EmptyStateSlot) {}

  route = {
    path: '~tests',
    children: <TestsPage emptyState={this.emptyStateSlot} />,
  };
  navigationLink = {
    href: '~tests',
    children: 'Tests',
  };
  order = 40;
}
