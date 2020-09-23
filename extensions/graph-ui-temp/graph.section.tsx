import { Section } from '@teambit/component';
import React from 'react';

import { GraphPage } from './ui/graph-page';

export class GraphSection implements Section {
  route = {
    path: '~Dependencies',
    children: <GraphPage />,
  };
  navigationLink = {
    href: '~Dependencies',
    children: 'Dependencies',
  };
  order = 40;
}
