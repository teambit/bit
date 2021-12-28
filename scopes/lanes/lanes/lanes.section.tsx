import React from 'react';
import { Section } from '@teambit/component';
import { EmptyStateSlot } from './lanes.ui.runtime';
import { LanesPage } from './ui/lanes-page';

export class LanesSection implements Section {
  constructor(private emptyStateSlot: EmptyStateSlot) {}

  route = {
    path: '~lanes',
    children: <LanesPage emptyState={this.emptyStateSlot} />,
  };
  navigationLink = {
    href: '~lanes',
    children: 'Lanes',
  };
  order = 40;
}
