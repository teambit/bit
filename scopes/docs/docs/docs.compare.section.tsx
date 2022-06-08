import React from 'react';
import { TitleBadgeSlot } from '@teambit/docs';
import { Section } from '@teambit/component';
import { OverviewCompare } from '@teambit/docs.ui.overview-compare';

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
