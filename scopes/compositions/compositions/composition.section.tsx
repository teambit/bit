import type { Section } from '@teambit/component';
import React from 'react';
import { Compositions } from './compositions';
import type {
  CompositionsUI,
  CompositionsMenuSlot,
  EmptyStateSlot,
  UsePreviewSandboxSlot,
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
    private usePreviewSandboxSlot: UsePreviewSandboxSlot
  ) {}

  navigationLink = {
    href: '~compositions',
    children: 'Preview',
  };

  route = {
    path: '~compositions/*',
    element: (
      <Compositions
        menuBarWidgets={this.options.menuBarWidgetSlot}
        emptyState={this.emptyStateSlot}
        usePreviewSandboxSlot={this.usePreviewSandboxSlot}
      />
    ),
  };

  order = 20;
}
