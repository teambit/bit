import type { Section } from '@teambit/component';
import React from 'react';
import { MenuWidgetIcon } from '@teambit/ui-foundation.ui.menu-widget-icon';
import { Compositions } from './compositions';
import type {
  CompositionsUI,
  CompositionsMenuSlot,
  EmptyStateSlot,
  UsePreviewSandboxSlot,
  UsePreviewPropsSlot,
} from './compositions.ui.runtime';

type Options = { menuBarWidgetSlot: CompositionsMenuSlot };

export class CompositionsSection implements Section {
  constructor(
    /**
     * simulations ui extension.
     */
    private compositions: CompositionsUI,
    private options: Options,
    private emptyStateSlot: EmptyStateSlot,
    private usePreviewSandboxSlot: UsePreviewSandboxSlot,
    private usePreviewPropsSlot: UsePreviewPropsSlot
  ) {}

  navigationLink = {
    href: '~compositions',
    children: 'Preview',
    displayName: 'Preview',
    // Preview is the most important view in minimal (Hope) mode: a text tab right after Overview on
    // desktop, and on mobile an icon pinned next to the compact "More" menu that holds Overview.
    primaryInMinimalMode: true,
    minimalMobileChildren: <MenuWidgetIcon icon="preview" tooltipContent="Preview" />,
  };

  route = {
    path: '~compositions/*',
    element: (
      <Compositions
        menuBarWidgets={this.options.menuBarWidgetSlot}
        emptyState={this.emptyStateSlot}
        usePreviewSandboxSlot={this.usePreviewSandboxSlot}
        usePreviewPropsSlot={this.usePreviewPropsSlot}
        enableLiveControls
      />
    ),
  };

  order = 20;
}
