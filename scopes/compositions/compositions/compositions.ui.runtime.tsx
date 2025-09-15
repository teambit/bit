import type { ReactNode, ComponentType } from 'react';
import React from 'react';
import type { SlotRegistry } from '@teambit/harmony';
import { Slot } from '@teambit/harmony';
import type { ComponentUI } from '@teambit/component';
import { ComponentAspect } from '@teambit/component';
import { UIRuntime } from '@teambit/ui';
import { CompositionCompareSection } from '@teambit/compositions.ui.composition-compare-section';
import { CompositionCompare } from '@teambit/compositions.ui.composition-compare';
import type { ComponentCompareUI } from '@teambit/component-compare';
import { ComponentCompareAspect } from '@teambit/component-compare';
import type { UseSandboxPermission } from '@teambit/preview.ui.component-preview';
import { CompositionsSection } from './composition.section';
import { CompositionsAspect } from './compositions.aspect';
import type { MenuBarWidget } from './compositions';
import { CompositionContent } from './compositions';

export type CompositionsMenuSlot = SlotRegistry<MenuBarWidget[]>;
export type EmptyStateSlot = SlotRegistry<ComponentType>;
export type UsePreviewSandboxSlot = SlotRegistry<UseSandboxPermission>;

export class CompositionsUI {
  constructor(
    private menuBarWidgetSlot: CompositionsMenuSlot,
    private emptyStateSlot: EmptyStateSlot,
    private usePreviewSandboxSlot: UsePreviewSandboxSlot
  ) {}
  /**
   * register a new tester empty state. this allows to register a different empty state from each environment for example.
   */
  registerEmptyState(emptyStateComponent: ComponentType) {
    this.emptyStateSlot.register(emptyStateComponent);
    return this;
  }

  registerMenuWidget(...widget: MenuBarWidget[]) {
    this.menuBarWidgetSlot.register(widget);
  }

  registerPreviewSandbox(useSandboxPermission: UseSandboxPermission) {
    this.usePreviewSandboxSlot.register(useSandboxPermission);
  }

  getCompositionsCompare = () => {
    return (
      <CompositionCompare
        emptyState={this.emptyStateSlot}
        PreviewView={(compositionProps) => {
          return <CompositionContent {...compositionProps} fullContentHeight forceHeight={'100%'} />;
        }}
      />
    );
  };

  static dependencies = [ComponentAspect, ComponentCompareAspect];
  static runtime = UIRuntime;
  static slots = [Slot.withType<ReactNode>(), Slot.withType<ComponentType>(), Slot.withType<UseSandboxPermission>()];

  static async provider(
    [component, componentCompare]: [ComponentUI, ComponentCompareUI],
    config: {},
    [compositionMenuSlot, emptyStateSlot, usePreviewSandboxSlot]: [
      CompositionsMenuSlot,
      EmptyStateSlot,
      UsePreviewSandboxSlot,
    ]
  ) {
    const compositions = new CompositionsUI(compositionMenuSlot, emptyStateSlot, usePreviewSandboxSlot);
    const section = new CompositionsSection(
      compositions,
      { menuBarWidgetSlot: compositions.menuBarWidgetSlot },
      emptyStateSlot,
      usePreviewSandboxSlot
    );
    const compositionCompare = new CompositionCompareSection(compositions);
    component.registerRoute(section.route);
    component.registerNavigation(section.navigationLink, section.order);
    componentCompare.registerNavigation(compositionCompare);
    componentCompare.registerRoutes([compositionCompare.route]);
    compositions.registerPreviewSandbox((manager, componentModel) => {
      if (componentModel?.host === 'teambit.scope/scope') {
        manager.add('allow-scripts');
        manager.add('allow-same-origin');
      }
    });
    return compositions;
  }
}

export default CompositionsUI;

CompositionsAspect.addRuntime(CompositionsUI);
