import React from 'react';
import { Section } from '@teambit/component';
import { OverviewCompare } from '@teambit/docs.ui.overview-compare';
import { DocsUI } from './docs.ui.runtime';

export class OverviewCompareSection implements Section {
  constructor(private docs: DocsUI) {}

  navigationLink = {
    href: '.',
    children: 'Overview',
    exact: true,
    order: 0,
  };

  route = {
    path: '*',
    element: <OverviewCompare titleBadges={this.docs.titleBadgeSlot} />,
  };
}
