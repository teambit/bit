import React from 'react';
import type { Section } from '@teambit/component';
import type { TabItem } from '@teambit/component.ui.component-compare.models.component-compare-props';
import type { ChangeType } from '@teambit/component.ui.component-compare.models.component-compare-change-type';
import { APICompare } from './api-compare';

// Use string cast since the external ChangeType enum doesn't have API yet
const ChangeTypeAPI = 'API' as unknown as ChangeType;

export class APICompareSection implements TabItem, Section {
  navigationLink = {
    href: 'api',
    children: 'API',
  };

  props = this.navigationLink;

  route = {
    path: 'api/*',
    element: <APICompare />,
  };

  order = 15;
  changeType = ChangeTypeAPI;
  id = 'api';
}
