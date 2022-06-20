import React from 'react';
import { Section } from '@teambit/component';
import { ComponentCompareAspects } from '@teambit/component.ui.compare';

export class AspectsCompareSection implements Section {
  constructor(private host: string) {}

  navigationLink = {
    href: 'aspects',
    children: 'Aspects',
    order: 6,
  };

  route = {
    path: 'aspects/*',
    element: <ComponentCompareAspects host={this.host} />,
  };
}
