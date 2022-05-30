import React from 'react';
import { EmptyStateSlot } from '@teambit/compositions';
import { Section } from '@teambit/component';
import { ComponentCompareComposition } from '@teambit/component.ui.component-compare-composition';

export class CompositionCompareSection implements Section {
  constructor(private emptyStateSlot: EmptyStateSlot) {}

  navigationLink = {
    href: 'compositions',
    children: 'Compositions',
    order: 1,
  };

  route = {
    path: 'compositions/*',
    element: <ComponentCompareComposition emptyState={this.emptyStateSlot} />,
  };
}
