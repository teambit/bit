import React from 'react';
import { Section } from '@teambit/component';
import { Overview, TitleBadgeSlot, OverviewOptionsSlot } from './overview';

export class OverviewSection implements Section {
  constructor(
    /**
     * title badge slot.
     */
    private titleBadgeSlot: TitleBadgeSlot,
    private overviewOptionsSlot: OverviewOptionsSlot
  ) {}

  navigationLink = {
    href: '.',
    exact: true,
    children: 'Overview',
  };

  route = {
    index: true,
    element: <Overview titleBadges={this.titleBadgeSlot} overviewOptions={this.overviewOptionsSlot} />,
  };

  order = 10;
}
