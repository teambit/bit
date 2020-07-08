import React from 'react';
import { Section } from '../component/section';
import { CompositionsUI } from './compositions.ui';
import { Compositions } from './compositions';

export class CompositionsSection implements Section {
  constructor(
    /**
     * simulations ui extension.
     */
    private compositions: CompositionsUI,

    /**
     * panels extension.
     */
    private panels: PanelsExtension
  ) {}

  navigationLink = {
    to: '~compositions',
    children: 'Compositions'
  };

  route = {
    path: '~compositions',
    children: <Compositions />
  };
}
