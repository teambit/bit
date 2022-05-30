import React from 'react';
import { TitleBadgeSlot } from '@teambit/docs';
import { Section } from '@teambit/component';
import { ComponentCompareOverview } from '@teambit/component.ui.component-compare-overview';

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
    element: <ComponentCompareOverview titleBadges={this.titleBadgeSlot} />,
  };
}
