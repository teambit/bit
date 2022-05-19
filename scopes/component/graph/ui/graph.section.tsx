import { Section } from '@teambit/component';
import React from 'react';

import { GraphPage } from './graph-page';
import { ComponentWidgetSlot } from '../graph.ui.runtime';

export class GraphSection implements Section {
  constructor(private componentWidgetSlot: ComponentWidgetSlot) {}

  route = {
    path: '~dependencies',
    element: <GraphPage componentWidgets={this.componentWidgetSlot} />,
  };
  navigationLink = {
    href: '~dependencies',
    children: 'Dependencies',
  };
  order = 40;
}
