import React from 'react';
import { Section } from '@teambit/component';
import { ChangeType } from '@teambit/component.ui.component-compare.models.component-compare-change-type';
import { TabItem } from '@teambit/component.ui.component-compare.models.component-compare-props';
import { DependenciesCompare } from '@teambit/graph';

export class GraphCompareSection implements Section, TabItem {
  navigationLink = {
    href: 'dependencies',
    children: 'Dependencies',
  };

  props = this.navigationLink;

  route = {
    path: 'dependencies/*',
    element: <DependenciesCompare />,
  };

  order = 25;
  changeType = ChangeType.DEPENDENCY;
  id = 'dependency';
}
