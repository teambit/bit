import React, { ComponentType } from 'react';
import { flatten } from 'lodash';
import { ComponentAspect, ComponentUI } from '@teambit/component';
import { Slot, SlotRegistry } from '@teambit/harmony';
import { UIRuntime } from '@teambit/ui';
import { ComponentCompareAspect, ComponentCompareUI } from '@teambit/component-compare';
import { OverviewCompare } from '@teambit/docs.ui.overview-compare';
import { OverviewCompareSection } from '@teambit/docs.ui.overview-compare-section';
import { UseSandboxPermission } from '@teambit/preview.ui.component-preview';
import { APIReferenceAspect, APIReferenceUI } from '@teambit/api-reference';
import { DocsAspect } from './docs.aspect';
import { OverviewSection } from './overview.section';
import type { TitleBadgeSlot, TitleBadge, OverviewOptionsSlot, OverviewOptions } from './overview';

export type UsePreviewSandboxSlot = SlotRegistry<UseSandboxPermission>;

export class DocsUI {
  constructor(
    readonly titleBadgeSlot: TitleBadgeSlot,
    readonly overviewOptionsSlot: OverviewOptionsSlot,
    private usePreviewSandboxSlot: UsePreviewSandboxSlot
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

  static slots = [Slot.withType<TitleBadge>(), Slot.withType<OverviewOptions>(), Slot.withType<UseSandboxPermission>()];

  static async provider(
    [component, componentCompare, apiRef]: [ComponentUI, ComponentCompareUI, APIReferenceUI],
    config,
    [titleBadgeSlot, overviewOptionsSlot, usePreviewSandboxSlot]: [
      TitleBadgeSlot,
      OverviewOptionsSlot,
      UsePreviewSandboxSlot,
    ]
  ) {
    const docs = new DocsUI(titleBadgeSlot, overviewOptionsSlot, usePreviewSandboxSlot);
    const section = new OverviewSection(titleBadgeSlot, overviewOptionsSlot, docs, apiRef, usePreviewSandboxSlot);
    const compareSection = new OverviewCompareSection(docs);
    component.registerRoute(section.route);
    component.registerNavigation(section.navigationLink, section.order);
    componentCompare.registerNavigation(compareSection);
    componentCompare.registerRoutes([compareSection.route]);
    docs.registerPreviewSandbox((manager, componentModel) => {
      if (componentModel?.host === 'teambit.scope/scope') {
        manager.add('allow-scripts');
        manager.add('allow-same-origin');
      }
    });
    return docs;
  }
}

export default DocsUI;

DocsAspect.addRuntime(DocsUI);
