import React from 'react';
import { Section } from '@teambit/component';
import { Overview, TitleBadgeSlot } from './overview';

export class OverviewSection implements Section {
  constructor(
    /**
     * title badge slot.
     */
    private titleBadgeSlot: TitleBadgeSlot
  ) {}

  navigationLink = {
    href: '.',
    exact: true,
    children: 'Overview',
  };

  route = {
    index: true,
    element: <Overview titleBadges={this.titleBadgeSlot} />,
  };

  order = 10;
}
