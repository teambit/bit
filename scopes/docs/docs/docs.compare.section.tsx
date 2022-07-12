import React from 'react';
import { Section } from '@teambit/component';
import { OverviewCompare } from '@teambit/docs.ui.overview-compare';
import { TitleBadge } from './overview';

export class OverviewCompareSection implements Section {
  constructor(private titleBadges: TitleBadge[]) {}

  navigationLink = {
    href: '.',
    children: 'Overview',
    exact: true,
    order: 0,
  };

  route = {
    path: '*',
    element: <OverviewCompare titleBadges={this.titleBadges} />,
  };
}
