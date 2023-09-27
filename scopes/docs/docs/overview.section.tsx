import React from 'react';
import { Section } from '@teambit/component';
import { Overview, TitleBadgeSlot, OverviewOptionsSlot } from './overview';
import { DocsUI } from './docs.ui.runtime';

export class OverviewSection implements Section {
  constructor(
    /**
     * title badge slot.
     */
    private titleBadgeSlot: TitleBadgeSlot,
    private overviewOptionsSlot: OverviewOptionsSlot,
    private docs: DocsUI
  ) {}

  navigationLink = {
    href: '.',
    exact: true,
    children: 'Overview',
  };

  route = {
    index: true,
    element: (
      <Overview
        titleBadges={this.titleBadgeSlot}
        overviewOptions={this.overviewOptionsSlot}
        getEmptyState={this.docs.getEmptyState.bind(this.docs)}
      />
    ),
  };

  order = 10;
}
