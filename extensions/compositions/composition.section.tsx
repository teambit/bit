import React from 'react';
import { Section } from '@teambit/component';
import { Compositions } from './compositions';
import { CompositionsUI } from './compositions.ui.runtime';

export class CompositionsSection implements Section {
  constructor(
    /**
     * simulations ui extension.
     */
    private compositions: CompositionsUI
  ) {}

  navigationLink = {
    href: '~compositions',
    children: 'Compositions',
  };

  route = {
    path: '~compositions',
    children: <Compositions />,
  };
}
