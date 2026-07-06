import type { ComponentType } from 'react';
import React from 'react';
import { flatten } from 'lodash';
import type { ComponentUI } from '@teambit/component';
import { ComponentAspect } from '@teambit/component';
import type { SlotRegistry } from '@teambit/harmony';
import { Slot } from '@teambit/harmony';
import { UIRuntime } from '@teambit/ui';
import type { ComponentCompareUI } from '@teambit/component-compare';
import { ComponentCompareAspect } from '@teambit/component-compare';
import { OverviewCompare } from '@teambit/docs.ui.overview-compare';
import { OverviewCompareSection } from '@teambit/docs.ui.overview-compare-section';
import type { UsePreviewProps, UseSandboxPermission } from '@teambit/preview.ui.component-preview';
import type { APIReferenceUI } from '@teambit/api-reference';
import { APIReferenceAspect } from '@teambit/api-reference';
import { DocsAspect } from './docs.aspect';
import docsCompareContainStyles from './docs-compare-contain.module.scss';
import { OverviewSection } from './overview.section';
import type { TitleBadgeSlot, TitleBadge, OverviewOptionsSlot, OverviewOptions } from './overview';

export type UsePreviewSandboxSlot = SlotRegistry<UseSandboxPermission>;
export type UsePreviewPropsSlot = SlotRegistry<UsePreviewProps>;

export class DocsUI {
  constructor(
    readonly titleBadgeSlot: TitleBadgeSlot,
    readonly overviewOptionsSlot: OverviewOptionsSlot,
    private usePreviewSandboxSlot: UsePreviewSandboxSlot,
    private usePreviewPropsSlot: UsePreviewPropsSlot
  ) {}

  /**
   * register a new title badge into the overview section of a component.
   */
  registerTitleBadge(titleBadges: TitleBadge | TitleBadge[]) {
    const badges = Array.isArray(titleBadges) ? titleBadges : [titleBadges];
    this.titleBadgeSlot.register(badges);
    return this;
  }

  /**
   * list all title badges registered.
   */
  listTitleBadges() {
    return flatten(this.titleBadgeSlot.values());
  }

  private _emptyState?: ComponentType;

  registerEmptyState(emptyState: ComponentType) {
    return (this._emptyState = emptyState);
  }

  registerPreviewSandbox(useSandboxPermission: UseSandboxPermission) {
    this.usePreviewSandboxSlot.register(useSandboxPermission);
  }

  /**
   * register a per-component resolver for iframe attributes on the overview preview
   * (`allow`, `referrerPolicy`, ...). The resolver runs at render time with the current
   * `ComponentModel`; results from multiple resolvers merge with later keys winning.
   */
  registerPreviewProps(usePreviewProps: UsePreviewProps) {
    this.usePreviewPropsSlot.register(usePreviewProps);
  }

  getEmptyState() {
    return this._emptyState;
  }

  getDocsCompare() {
    return <OverviewCompare titleBadges={this.titleBadgeSlot} overviewOptions={this.overviewOptionsSlot} />;
  }

  registerOverviewOptions(options: OverviewOptions) {
    this.overviewOptionsSlot.register(options);
  }

  static dependencies = [ComponentAspect, ComponentCompareAspect, APIReferenceAspect];

  static runtime = UIRuntime;

  static slots = [
    Slot.withType<TitleBadge>(),
    Slot.withType<OverviewOptions>(),
    Slot.withType<UseSandboxPermission>(),
    Slot.withType<UsePreviewProps>(),
  ];

  static async provider(
    [component, componentCompare, apiRef]: [ComponentUI, ComponentCompareUI, APIReferenceUI],
    config: {},
    [titleBadgeSlot, overviewOptionsSlot, usePreviewSandboxSlot, usePreviewPropsSlot]: [
      TitleBadgeSlot,
      OverviewOptionsSlot,
      UsePreviewSandboxSlot,
      UsePreviewPropsSlot,
    ]
  ) {
    const docs = new DocsUI(titleBadgeSlot, overviewOptionsSlot, usePreviewSandboxSlot, usePreviewPropsSlot);
    const section = new OverviewSection(
      titleBadgeSlot,
      overviewOptionsSlot,
      docs,
      apiRef,
      usePreviewSandboxSlot,
      usePreviewPropsSlot
    );
    const compareSection = new OverviewCompareSection(docs);
    component.registerRoute(section.route);
    component.registerNavigation(section.navigationLink, section.order);
    componentCompare.registerNavigation(compareSection);
    componentCompare.registerRoutes([compareSection.route]);
    // Register the inline docs tab on component-compare (canonical owner; shared by the single
    // component-compare page and lane-compare). `docs.getDocsCompare()` returns
    // `<OverviewCompare titleBadges={this.titleBadgeSlot} overviewOptions={this.overviewOptionsSlot} />`,
    // so any other aspect that registers title badges or overview options sees those contributions
    // in the inline-docs panel too.
    componentCompare.registerCompareTab({
      id: 'inline-docs',
      order: 3,
      displayName: 'Docs',
      // OverviewCompare renders base/compare docs side by side via the external split-layout preset,
      // whose panes are `flex: 1` without `min-width: 0`, so each spans its full (wide) content and the
      // pair overflows. `docsCompareContainStyles.contain` hard-caps the width and forces the two panes
      // to share it (see the scss for details) — external component, so we target its panes by class.
      element: <div className={docsCompareContainStyles.contain}>{docs.getDocsCompare()}</div>,
    });
    docs.registerPreviewSandbox((manager, componentModel) => {
      if (componentModel?.host === 'teambit.scope/scope') {
        manager.add('allow-scripts');
        manager.add('allow-same-origin');
      }
    });
    // Default Permissions Policy: allow clipboard writes so copy-to-clipboard buttons in
    // readme MDX work. Clipboard-read, camera, mic, geolocation, etc. remain denied.
    docs.registerPreviewProps((manager) => {
      manager.set('allow', 'clipboard-write');
    });
    return docs;
  }
}

export default DocsUI;

DocsAspect.addRuntime(DocsUI);
