import React from 'react';
import { EmptyStateSlot } from '@teambit/compositions';
import { Section } from '@teambit/component';
import { CompositionCompare } from '@teambit/compositions.ui.composition-compare';

export class CompositionCompareSection implements Section {
  constructor(private emptyStateSlot: EmptyStateSlot) {}

  navigationLink = {
    href: 'compositions',
    children: 'Compositions',
    order: 1,
  };

  route = {
    path: 'compositions/*',
    element: <CompositionCompare emptyState={this.emptyStateSlot} />,
  };
}
