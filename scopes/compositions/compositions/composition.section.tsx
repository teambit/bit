import { Section } from '@teambit/component';
import React from 'react';

import { Compositions } from './compositions';
import type { CompositionsUI, CompositionsMenuSlot } from './compositions.ui.runtime';

type Options = { menuBarWidgetSlot: CompositionsMenuSlot };

export class CompositionsSection implements Section {
  constructor(
    /**
     * simulations ui extension.
     */
    private compositions: CompositionsUI,
    private options: Options
  ) {}

  navigationLink = {
    href: '~compositions',
    children: 'Compositions',
  };

  route = {
    path: '~compositions',
    children: <Compositions menuBarWidgets={this.options.menuBarWidgetSlot} />,
  };

  order = 20;
}
