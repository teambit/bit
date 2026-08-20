import React from 'react';
import type { Section } from '@teambit/component';
import type { TabItem } from '@teambit/component.ui.component-compare.models.component-compare-props';
import type { ChangeType } from '@teambit/component.ui.component-compare.models.component-compare-change-type';
import type { ApiDiffInsight } from '@teambit/semantics.ui.api-diff-view';
import { APICompare } from './api-compare';

// Use string cast since the external ChangeType enum doesn't have API yet
const ChangeTypeAPI = 'API' as unknown as ChangeType;

export class APICompareSection implements TabItem, Section {
  route: { path: string; element: React.ReactNode };

  constructor(getInsights?: () => ApiDiffInsight[]) {
    // built in the constructor (not a field initializer) so the element captures the
    // getter regardless of class-field initialization order.
    this.route = {
      path: 'api/*',
      element: <APICompare getInsights={getInsights} />,
    };
  }

  navigationLink = {
    href: 'api',
    children: 'API',
  };

  props = this.navigationLink;

  order = 15;
  changeType = ChangeTypeAPI;
  id = 'api';
}
