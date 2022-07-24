import React from 'react';
import { Section } from '@teambit/component';
import { OverviewCompare } from '@teambit/docs.ui.overview-compare';
import { TitleBadgeSlot } from './overview';

export class OverviewCompareSection implements Section {
  constructor(private titleBadgeSlot: TitleBadgeSlot) {}

  navigationLink = {
    href: '.',
    children: 'Overview',
    exact: true,
    order: 0,
  };

  route = {
    path: '*',
    element: <OverviewCompare titleBadges={this.titleBadgeSlot} />,
  };
}
