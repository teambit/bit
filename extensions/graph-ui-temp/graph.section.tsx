import { Section } from '@teambit/component';
import React from 'react';

import { GraphPage } from './ui/graph-page';

export class GraphSection implements Section {
  route = {
    path: '~graph',
    children: <GraphPage />,
  };
  navigationLink = {
    href: '~graph',
    children: 'Graph',
  };
  order = 40;
}
