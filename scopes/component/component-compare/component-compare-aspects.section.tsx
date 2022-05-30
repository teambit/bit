import React from 'react';
import { Section } from '@teambit/component';
import { ComponentCompareAspects } from '@teambit/component.ui.component-compare-aspects';

export class AspectsCompareSection implements Section {
  constructor(private host: string) {}

  navigationLink = {
    href: 'aspects',
    children: 'Aspects',
    order: 5,
  };

  route = {
    path: 'aspects/*',
    element: <ComponentCompareAspects host={this.host} />,
  };
}
