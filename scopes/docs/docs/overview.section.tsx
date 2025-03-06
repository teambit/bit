import React from 'react';
import { Section } from '@teambit/component';
import { APIReferenceUI } from '@teambit/api-reference';
import { Overview, TitleBadgeSlot, OverviewOptionsSlot } from './overview';
import { DocsUI, UsePreviewSandboxSlot } from './docs.ui.runtime';

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
