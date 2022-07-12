import React from 'react';
import { Section } from '@teambit/component';
import { Overview, TitleBadge } from './overview';

export class OverviewSection implements Section {
  constructor(
    /**
     * docs ui extension.
     */
    private titleBadges: TitleBadge[]
  ) {}

  navigationLink = {
    href: '.',
    exact: true,
    children: 'Overview',
  };

  route = {
    index: true,
    element: <Overview titleBadges={this.titleBadges} />,
  };

  order = 10;
}
