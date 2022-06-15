import React from 'react';
import { Section } from '@teambit/component';
import { ComponentCompareChangelog } from '@teambit/component.ui.compare';

export class CompareChangelogSection implements Section {
  navigationLink = {
    href: 'changelog',
    children: 'Changelog',
    order: 6,
  };

  route = {
    path: 'changelog/*',
    element: <ComponentCompareChangelog/>,
  };
}
