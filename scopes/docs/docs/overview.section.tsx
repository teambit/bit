import React from 'react';
import type { Section } from '@teambit/component';
import type { APIReferenceUI } from '@teambit/api-reference';
import type { TitleBadgeSlot, OverviewOptionsSlot } from './overview';
import { Overview } from './overview';
import type { DocsUI, UsePreviewSandboxSlot } from './docs.ui.runtime';

export class OverviewSection implements Section {
  constructor(
    /**
     * title badge slot.
     */
    private titleBadgeSlot: TitleBadgeSlot,
    private overviewOptionsSlot: OverviewOptionsSlot,
    private docs: DocsUI,
    private apiRef: APIReferenceUI,
    private usePreviewSandboxSlot: UsePreviewSandboxSlot
  ) {}

  navigationLink = {
    href: '.',
    exact: true,
    children: 'Overview',
  };

  route = {
    index: true,
    element: (
      <Overview
        titleBadges={this.titleBadgeSlot}
        overviewOptions={this.overviewOptionsSlot}
        getEmptyState={this.docs.getEmptyState.bind(this.docs)}
        TaggedAPI={this.apiRef.TaggedAPIPage}
        usePreviewSandboxSlot={this.usePreviewSandboxSlot}
      />
    ),
  };

  order = 10;
}
