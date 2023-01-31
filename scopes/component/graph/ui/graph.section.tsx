import { Section } from '@teambit/component';
import React from 'react';

import { ChangeType } from '@teambit/component.ui.component-compare.models.component-compare-change-type';
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
  changeType = ChangeType.DEPENDENCY;
}
