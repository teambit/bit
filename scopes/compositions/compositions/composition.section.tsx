import { Section } from '@teambit/component';
import React from 'react';
import { CompositionsViewer, CompositionSlots } from '@teambit/compositions.ui.compositions-viewer';
import type { CompositionsUI, CompositionsMenuSlot, EmptyStateSlot } from './compositions.ui.runtime';

type Options = { menuBarWidgetSlot: CompositionsMenuSlot };

export class CompositionsSection implements Section {
  constructor(
    /**
     * simulations ui extension.
     */
    private compositions: CompositionsUI,
    private options: Options,
    private emptyStateSlot: EmptyStateSlot
  ) {}

  navigationLink = {
    href: '~compositions',
    children: 'Compositions',
  };

  private slots: CompositionSlots = {
    menuItems: this.options.menuBarWidgetSlot
  }

  route = {
    path: '~compositions',
    children: <CompositionsViewer slots={this.slots} emptyState={this.emptyStateSlot} />,
  };

  order = 20;
}
