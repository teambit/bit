import { Section } from '@teambit/component';
import React from 'react';
import { Compositions } from './compositions';
import type { CompositionsUI, CompositionsMenuSlot } from './compositions.ui.runtime';
import { EmptyStateSlot } from './compositions.ui.runtime';

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

  route = {
    path: '~compositions',
    children: <Compositions emptyState={this.emptyStateSlot} menuBarWidgets={this.options.menuBarWidgetSlot} />,
  };

  order = 20;
}
