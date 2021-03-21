import { Section } from '@teambit/component';
import React from 'react';

import { Compositions } from './compositions';
import { CompositionsUI } from './compositions.ui.runtime';

type Options = { onToggleHighlight?: (active: boolean) => void };

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
    children: <Compositions onToggleHighlight={this.options.onToggleHighlight} />,
  };

  order = 20;
}
