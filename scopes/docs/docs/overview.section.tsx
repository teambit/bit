import React from 'react';
import { Section } from '@teambit/component';
import { Overview } from './overview';
import { DocsUI } from './docs.ui.runtime';

export class OverviewSection implements Section {
  constructor(
    /**
     * docs ui extension.
     */
    private docs: DocsUI
  ) {}

  navigationLink = {
    href: '.',
    exact: true,
    children: 'Overview',
  };

  route = {
    index: true,
    element: <Overview titleBadges={this.docs.titleBadgeSlot} />,
  };

  order = 10;
}
